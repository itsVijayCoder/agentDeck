import { describe, expect, it, vi } from "vitest";

import { CloudEventSink } from "./event-sink.js";
import { ReplayBuffer } from "./replay-buffer.js";

describe("CloudEventSink", () => {
	it("batches and redacts outbound events", async () => {
		const sent: string[] = [];
		const sink = new CloudEventSink((data) => {
			sent.push(data);
			return true;
		}, { privacyMode: "metadata-only" });

		sink.emit({
			payload: { data: "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz" },
			runId: "run-1",
			type: "terminal.stdout",
		});
		await sink.flush();

		expect(sent).toHaveLength(1);
		expect(JSON.parse(sent[0] ?? "{}")).toEqual({
			events: [
				{
					payload: { data: "OPENAI_API_KEY=[REDACTED]" },
					runId: "run-1",
					source: "bridge",
					type: "terminal.stdout",
				},
			],
			type: "event.batch",
		});
		expect(sink.getStats().redactions).toBe(1);
	});

	it("drops sensitive local-only events before cloud sync", async () => {
		const sent: string[] = [];
		const sink = new CloudEventSink((data) => {
			sent.push(data);
		}, { privacyMode: "local-only" });

		sink.emit({ payload: { data: "secret output" }, type: "terminal.stdout" });
		sink.emit({ payload: { machineId: "machine-1", sentAt: "now" }, type: "machine.heartbeat" });
		await sink.flush();

		expect(sent).toHaveLength(1);
		expect(JSON.parse(sent[0] ?? "{}")).toMatchObject({
			events: [{ type: "machine.heartbeat" }],
		});
		expect(sink.getStats().droppedLocalOnly).toBe(1);
	});

	it("stores unsent batches for replay", async () => {
		const replayBuffer = new ReplayBuffer<string>();
		const sink = new CloudEventSink(() => false, {
			privacyMode: "metadata-only",
			replayBuffer,
		});

		sink.emit({ payload: { machineId: "machine-1", sentAt: "now" }, type: "machine.heartbeat" });
		await sink.flush();

		expect(replayBuffer.size).toBe(1);
	});

	it("flushes replayed batches after reconnect", async () => {
		const replayBuffer = new ReplayBuffer<string>();
		replayBuffer.push(JSON.stringify({ events: [], type: "event.batch" }));
		const sent: string[] = [];
		const sink = new CloudEventSink((data) => {
			sent.push(data);
			return true;
		}, { privacyMode: "metadata-only", replayBuffer });

		sink.flushReplayBuffer();

		expect(replayBuffer.size).toBe(0);
		expect(sent).toHaveLength(1);
	});

	it("keeps replay batches when reconnect send still fails", () => {
		const replayBuffer = new ReplayBuffer<string>();
		replayBuffer.push(JSON.stringify({ events: [], type: "event.batch" }));
		const sink = new CloudEventSink(() => false, { privacyMode: "metadata-only", replayBuffer });

		sink.flushReplayBuffer();

		expect(replayBuffer.size).toBe(1);
	});

	it("flushes immediately at max buffer size and ignores empty flushes", async () => {
		const sent: string[] = [];
		const sink = new CloudEventSink((data) => {
			sent.push(data);
			return true;
		}, { maxBufferSize: 1, privacyMode: "metadata-only" });

		sink.emit({ payload: { machineId: "machine-1", sentAt: "now" }, type: "machine.heartbeat" });
		await sink.flush();
		await sink.flush();

		expect(sent).toHaveLength(1);
	});

	it("flushes on the configured timer", async () => {
		vi.useFakeTimers();
		const sent: string[] = [];
		const sink = new CloudEventSink((data) => {
			sent.push(data);
			return true;
		}, { flushIntervalMs: 25, privacyMode: "metadata-only" });

		sink.emit({ payload: { machineId: "machine-1", sentAt: "now" }, source: "agent", type: "machine.heartbeat" });
		await vi.advanceTimersByTimeAsync(25);

		expect(sent).toHaveLength(1);
		expect(JSON.parse(sent[0] ?? "{}")).toMatchObject({ events: [{ source: "agent" }] });
		vi.useRealTimers();
	});
});
