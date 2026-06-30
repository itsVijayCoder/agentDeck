import { describe, expect, it, vi } from "vitest";

import { createJsonLogger, Logger } from "./logger";
import { MetricsCollector } from "./metrics";
import { createSpanId, createTraceId, Tracer } from "./tracing";

const fixedDate = new Date("2026-06-30T00:00:00.000Z");

describe("MetricsCollector", () => {
	it("records counters, gauges, timings, summaries, and flushes defensively copied points", () => {
		const collector = new MetricsCollector(() => fixedDate);

		collector.increment("run_count", { workspaceId: "ws_01" });
		collector.gauge("cost_usd_by_workspace", 2.5, { workspaceId: "ws_01" });
		collector.timing("latency_p95_ms", 250, { workspaceId: "ws_01" });
		collector.timing("latency_p95_ms", 150, { workspaceId: "ws_01" });

		const summaries = collector.summarize();
		expect(summaries).toContainEqual({
			avg: 200,
			count: 2,
			labels: { workspaceId: "ws_01" },
			max: 250,
			min: 150,
			name: "latency_p95_ms",
			sum: 400,
		});

		const points = collector.flush();
		points[0]!.labels.workspaceId = "mutated";
		expect(collector.peek()).toEqual([]);
		expect(points).toHaveLength(4);
		expect(points[0]).toMatchObject({ name: "run_count", timestamp: fixedDate.toISOString(), value: 1 });
	});

	it("rejects non-finite metric values", () => {
		const collector = new MetricsCollector();
		expect(() => collector.gauge("run_success_rate", Number.NaN)).toThrow(TypeError);
	});

	it("uses the default clock when no clock is supplied", () => {
		const collector = new MetricsCollector();
		collector.increment("policy_block_count");
		expect(collector.peek()[0]?.timestamp).toEqual(expect.any(String));
	});

	it("summarizes caller-provided points with stable label ordering", () => {
		const collector = new MetricsCollector(() => fixedDate);
		const summaries = collector.summarize([
			{ labels: { b: "2", a: "1" }, name: "approval_count", timestamp: fixedDate.toISOString(), value: 2 },
			{ labels: { a: "1", b: "2" }, name: "approval_count", timestamp: fixedDate.toISOString(), value: 4 },
		]);

		expect(summaries).toEqual([
			{
				avg: 3,
				count: 2,
				labels: { b: "2", a: "1" },
				max: 4,
				min: 2,
				name: "approval_count",
				sum: 6,
			},
		]);
	});
});

describe("Tracer", () => {
	it("creates trace contexts, parented spans, events, and flushed copies", () => {
		let now = 100;
		let spanCounter = 0;
		const tracer = new Tracer({
			clock: () => (now += 10),
			ids: {
				spanId: () => `span_${++spanCounter}`,
				traceId: () => "trace_01",
			},
		});
		const ctx = tracer.createTraceContext({
			queueItemId: "queue_01",
			runId: "run_01",
			sessionId: "sess_01",
			workspaceId: "ws_01",
		});

		const parent = tracer.startSpan("workflow", ctx, { attempt: 1 });
		const child = tracer.startSpan("dispatch", ctx);
		tracer.addEvent(child, "accepted", { bridgeCount: 1 });
		tracer.endSpan(child);
		tracer.endSpan(parent);

		expect(ctx.traceId).toBe("trace_01");
		expect(tracer.getSpans()).toMatchObject([
			{ name: "workflow", spanId: "span_1", status: "ok", traceId: "trace_01" },
			{ events: [{ name: "accepted" }], name: "dispatch", parentSpanId: "span_1", spanId: "span_2" },
		]);
		expect(tracer.flush()).toHaveLength(2);
		expect(tracer.getSpans()).toEqual([]);
	});

	it("marks withSpan errors and rethrows the original failure", async () => {
		const tracer = new Tracer({
			clock: () => 1,
			ids: { spanId: () => "span_01", traceId: () => "trace_01" },
		});
		const ctx = tracer.createTraceContext({ runId: "run_01", sessionId: "sess_01" });

		await expect(
			tracer.withSpan("danger", ctx, async () => {
				throw new Error("failed");
			}),
		).rejects.toThrow("failed");
		expect(tracer.getSpans()[0]).toMatchObject({ events: [{ name: "exception" }], status: "error" });
	});

	it("marks withSpan successes and creates valid default identifiers", async () => {
		const tracer = new Tracer({
			clock: () => 10,
			ids: { spanId: () => "span_ok", traceId: () => "trace_ok" },
		});
		const ctx = tracer.createTraceContext({ runId: "run_01", sessionId: "sess_01", traceId: "trace_existing" });

		await expect(tracer.withSpan("ok", ctx, async (span) => span.spanId)).resolves.toBe("span_ok");
		expect(tracer.getSpans()[0]).toMatchObject({ endTime: 10, status: "ok", traceId: "trace_existing" });
		expect(createTraceId()).toMatch(/^[a-f0-9]{32}$/u);
		expect(createSpanId()).toMatch(/^[a-f0-9]{16}$/u);
	});

	it("captures every optional trace context attribute and copies unfinished spans", () => {
		const tracer = new Tracer({
			clock: () => 5,
			ids: { spanId: () => "span_full", traceId: () => "trace_full" },
		});
		const ctx = tracer.createTraceContext({
			agentId: "agent_01",
			machineId: "machine_01",
			queueItemId: "queue_01",
			runId: "run_01",
			scheduleId: "schedule_01",
			sessionId: "sess_01",
			workflowId: "workflow_01",
			workspaceId: "ws_01",
		});
		const span = tracer.startSpan("full", ctx);
		tracer.addEvent(span, "checkpoint");

		expect(tracer.getSpans()).toEqual([
			{
				attributes: {
					agentId: "agent_01",
					machineId: "machine_01",
					queueItemId: "queue_01",
					runId: "run_01",
					scheduleId: "schedule_01",
					sessionId: "sess_01",
					workflowId: "workflow_01",
					workspaceId: "ws_01",
				},
				events: [{ name: "checkpoint", timestamp: 5 }],
				name: "full",
				spanId: "span_full",
				startTime: 5,
				status: "ok",
				traceId: "trace_full",
			},
		]);
	});
});

describe("Logger", () => {
	it("filters levels, normalizes errors, and supports child context", () => {
		const entries: unknown[] = [];
		const logger = new Logger({
			clock: () => fixedDate,
			minLevel: "warn",
			sink: (entry) => entries.push(entry),
		}).child({ traceId: "trace_01" });

		logger.info("ignored");
		logger.warn("approval waiting", { runId: "run_01" });
		logger.error("worker failed", { cause: new Error("boom") });

		expect(entries).toEqual([
			{
				level: "warn",
				message: "approval waiting",
				runId: "run_01",
				timestamp: fixedDate.toISOString(),
				traceId: "trace_01",
			},
			{
				cause: { message: "boom", name: "Error" },
				level: "error",
				message: "worker failed",
				timestamp: fixedDate.toISOString(),
				traceId: "trace_01",
			},
		]);
	});

	it("emits debug/info logs when the minimum level allows them and serializes JSON logs", () => {
		const entries: unknown[] = [];
		const logger = new Logger({
			clock: () => fixedDate,
			minLevel: "debug",
			sink: (entry) => entries.push(entry),
		});

		logger.debug("debugging", { sessionId: "sess_01" });
		logger.info("ready", { count: 1 });

		expect(entries).toMatchObject([
			{ level: "debug", message: "debugging", sessionId: "sess_01" },
			{ count: 1, level: "info", message: "ready" },
		]);

		const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		createJsonLogger("debug").debug("json", { traceId: "trace_01" });
		expect(spy).toHaveBeenCalledWith(expect.stringContaining("\"traceId\":\"trace_01\""));
		spy.mockRestore();
	});

	it("uses default logger constructor options", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
		new Logger().warn("default sink");
		expect(spy).toHaveBeenCalledWith(expect.objectContaining({ level: "warn", message: "default sink" }));
		spy.mockRestore();
	});
});
