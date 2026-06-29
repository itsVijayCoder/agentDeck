import { describe, expect, it } from "vitest";

import { mapPiEventToAgentDeck } from "./pi.events.js";

const ctx = { harnessMode: "rpc", runId: "run-1" };

describe("mapPiEventToAgentDeck", () => {
	it("maps lifecycle and message events to core event names", () => {
		expect(mapPiEventToAgentDeck({ type: "agent_start" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { agentKind: "pi", harnessMode: "rpc" },
				type: "agent.started",
			}),
		]);
		expect(
			mapPiEventToAgentDeck(
				{
					assistantMessageEvent: { delta: "hello", type: "text_delta" },
					messageId: "msg-1",
					type: "message_update",
				},
				ctx,
			),
		).toEqual([
			expect.objectContaining({
				payload: { delta: "hello", messageId: "msg-1" },
				type: "message.assistant_delta",
			}),
		]);
		expect(mapPiEventToAgentDeck({ messageId: "msg-1", type: "message_end" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { messageId: "msg-1" },
				type: "message.assistant_end",
			}),
		]);
	});

	it("maps tool events with policy-derived risk and redacted output", () => {
		const start = mapPiEventToAgentDeck(
			{
				args: { command: "git push origin main" },
				toolCallId: "tool-1",
				toolName: "bash",
				type: "tool_execution_start",
			},
			ctx,
		);
		const delta = mapPiEventToAgentDeck(
			{
				partialResult: { OPENAI_API_KEY: "sk-abcdefghijklmnopqrstuvwxyz" },
				toolCallId: "tool-1",
				type: "tool_execution_update",
			},
			ctx,
		);

		expect(start).toEqual([
			expect.objectContaining({
				payload: { risk: "critical", toolCallId: "tool-1", toolName: "bash" },
				type: "tool.start",
			}),
		]);
		expect(delta).toEqual([
			expect.objectContaining({
				payload: { delta: "{\"OPENAI_API_KEY\":\"[REDACTED]\"}", toolCallId: "tool-1" },
				type: "tool.delta",
			}),
		]);
	});

	it("maps approvals, queue updates, final messages, and process exits", () => {
		expect(mapPiEventToAgentDeck({ approvalId: "app-1", risk: "high", title: "Run install", type: "approval_request" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { approvalId: "app-1", risk: "high", title: "Run install" },
				type: "approval.requested",
			}),
		]);
		expect(mapPiEventToAgentDeck({ deliveryPolicy: "after-run-completes", messageId: "msg-2", type: "queue_update" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { deliveryPolicy: "after-run-completes", messageId: "msg-2" },
				type: "message.queued",
			}),
		]);
		expect(mapPiEventToAgentDeck({ content: "done", messageId: "msg-3", type: "final_message" }, ctx).map((event) => event.type)).toEqual([
			"message.assistant_delta",
			"message.assistant_end",
			"agent.ended",
		]);
		expect(mapPiEventToAgentDeck({ exitCode: 0, type: "process_exit" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { exitCode: 0 },
				type: "terminal.closed",
			}),
		]);
	});

	it("drops unknown native events instead of leaking native event names", () => {
		expect(mapPiEventToAgentDeck({ type: "vendor_specific_event", value: true }, ctx)).toEqual([]);
	});

	it("covers defensive fallbacks without leaking native fields", () => {
		expect(mapPiEventToAgentDeck(null, ctx)).toEqual([]);
		expect(mapPiEventToAgentDeck({ type: "session" }, { ...ctx, agentKind: "codex" })).toEqual([
			expect.objectContaining({
				payload: { agentKind: "codex", harnessMode: "rpc" },
				type: "agent.started",
			}),
		]);
		expect(mapPiEventToAgentDeck({ status: "cancelled", type: "agent_end" }, ctx)).toEqual([
			expect.objectContaining({ payload: { agentKind: "pi", status: "cancelled" } }),
		]);
		expect(mapPiEventToAgentDeck({ status: "failed", type: "agent_end" }, ctx)).toEqual([
			expect.objectContaining({ payload: { agentKind: "pi", status: "failed" } }),
		]);
		expect(mapPiEventToAgentDeck({ status: "other", type: "agent_end" }, ctx)).toEqual([
			expect.objectContaining({ payload: { agentKind: "pi", status: "completed" } }),
		]);
		expect(mapPiEventToAgentDeck({ id: "msg-id", type: "message_start" }, ctx)).toEqual([
			expect.objectContaining({ payload: { agentKind: "pi", messageId: "msg-id" } }),
		]);
		expect(mapPiEventToAgentDeck({ type: "message_update" }, ctx)).toEqual([]);
		expect(mapPiEventToAgentDeck({ text: "text", type: "assistant_delta" }, ctx)).toEqual([
			expect.objectContaining({ payload: { delta: "text", messageId: "msg-run-1" } }),
		]);
		expect(mapPiEventToAgentDeck({ content: "content", id: "msg-content", type: "thinking_delta" }, ctx)).toEqual([
			expect.objectContaining({ payload: { delta: "content", messageId: "msg-content" } }),
		]);
	});

	it("covers tool, approval, queue, terminal, and JSON fallback branches", () => {
		expect(mapPiEventToAgentDeck({ name: "shell", type: "tool_start" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { risk: "high", toolCallId: "tool-run-1", toolName: "shell" },
				type: "tool.start",
			}),
		]);
		expect(mapPiEventToAgentDeck({ name: "read_file", type: "tool_start" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { risk: "medium", toolCallId: "tool-run-1", toolName: "read_file" },
				type: "tool.start",
			}),
		]);
		expect(mapPiEventToAgentDeck({ args: { cmd: "pnpm install" }, id: "tool-2", type: "tool_start" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { risk: "medium", toolCallId: "tool-2", toolName: "tool" },
				type: "tool.start",
			}),
		]);
		expect(mapPiEventToAgentDeck({ delta: ["a", 1, Number.NaN, null], id: "tool-3", type: "tool_delta" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { delta: "[\"a\",1,null,null]", toolCallId: "tool-3" },
				type: "tool.delta",
			}),
		]);
		expect(mapPiEventToAgentDeck({ error: "boom", id: "tool-4", type: "tool_error" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { error: "boom", toolCallId: "tool-4" },
				type: "tool.error",
			}),
		]);
		expect(mapPiEventToAgentDeck({ id: "tool-5", resultRef: "r2://tool", type: "tool_end" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { resultRef: "r2://tool", status: "success", toolCallId: "tool-5" },
				type: "tool.end",
			}),
		]);
		expect(mapPiEventToAgentDeck({ id: "tool-6", isError: true, type: "tool_end" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { status: "error", toolCallId: "tool-6" },
				type: "tool.end",
			}),
		]);
		expect(mapPiEventToAgentDeck({ id: "approval-id", risk: "not-real", type: "approval_requested" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { approvalId: "approval-id", risk: "medium", title: "Agent approval requested" },
				type: "approval.requested",
			}),
		]);
		expect(mapPiEventToAgentDeck({ type: "queue_update" }, ctx)).toEqual([
			expect.objectContaining({
				payload: { deliveryPolicy: "after-current-turn", messageId: "queued-run-1" },
				type: "message.queued",
			}),
		]);
		expect(mapPiEventToAgentDeck({ type: "final_message" }, ctx).map((event) => event.type)).toEqual([
			"message.assistant_end",
			"agent.ended",
		]);
		expect(mapPiEventToAgentDeck({ data: "out", type: "stdout" }, ctx)).toEqual([
			expect.objectContaining({ payload: { data: "out" }, type: "terminal.stdout" }),
		]);
		expect(mapPiEventToAgentDeck({ data: "err", type: "stderr" }, ctx)).toEqual([
			expect.objectContaining({ payload: { data: "err" }, type: "terminal.stderr" }),
		]);
		expect(mapPiEventToAgentDeck({ message: "failed", type: "error" }, ctx)).toEqual([
			expect.objectContaining({ payload: { data: "failed" }, type: "terminal.stderr" }),
		]);
		expect(mapPiEventToAgentDeck({ signal: "SIGTERM", type: "process_exit" }, ctx)).toEqual([
			expect.objectContaining({ payload: { signal: "SIGTERM" }, type: "terminal.closed" }),
		]);
	});
});
