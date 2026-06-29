import { describe, expect, it } from "vitest";

import {
	agentEndedEvent,
	agentStartedEvent,
	approvalRequestedEvent,
	assistantDeltaEvent,
	assistantEndEvent,
	assistantStartEvent,
	deliveredMessageEvent,
	queuedMessageEvent,
	stringifyJsonValue,
	terminalClosedEvent,
	terminalStderrEvent,
	terminalStdoutEvent,
	toolDeltaEvent,
	toolEndEvent,
	toolErrorEvent,
	toolStartEvent,
} from "./events.js";

describe("harness event helpers", () => {
	it("creates normalized agent lifecycle drafts", () => {
		expect(agentStartedEvent({ agentKind: "pi", harnessMode: "rpc", runId: "run_1" })).toEqual({
			payload: { agentKind: "pi", harnessMode: "rpc" },
			runId: "run_1",
			source: "agent",
			type: "agent.started",
			visibility: "metadata",
		});
		expect(agentEndedEvent({ agentKind: "pi", runId: "run_1", status: "completed" })).toEqual({
			payload: { agentKind: "pi", status: "completed" },
			runId: "run_1",
			source: "agent",
			type: "agent.ended",
			visibility: "metadata",
		});
	});

	it("creates normalized message drafts", () => {
		expect(assistantStartEvent({ agentKind: "codex", messageId: "msg_1", runId: "run_1" })).toMatchObject({
			payload: { agentKind: "codex", messageId: "msg_1" },
			type: "message.assistant_start",
			visibility: "metadata",
		});
		expect(assistantDeltaEvent({ delta: "hello", messageId: "msg_1", runId: "run_1" })).toMatchObject({
			payload: { delta: "hello", messageId: "msg_1" },
			type: "message.assistant_delta",
			visibility: "local-only",
		});
		expect(assistantEndEvent({ contentRef: "r2://x", messageId: "msg_1", runId: "run_1" })).toMatchObject({
			payload: { contentRef: "r2://x", messageId: "msg_1" },
			type: "message.assistant_end",
			visibility: "metadata",
		});
		expect(assistantEndEvent({ messageId: "msg_1", runId: "run_1" })).toMatchObject({
			payload: { messageId: "msg_1" },
			type: "message.assistant_end",
			visibility: "local-only",
		});
		expect(queuedMessageEvent({ deliveryPolicy: "after-current-turn", messageId: "msg_2", runId: "run_1" })).toMatchObject({
			payload: { deliveryPolicy: "after-current-turn", messageId: "msg_2" },
			type: "message.queued",
		});
		expect(deliveredMessageEvent({ messageId: "msg_2", runId: "run_1" })).toMatchObject({
			payload: { messageId: "msg_2" },
			type: "message.delivered",
		});
	});

	it("creates normalized terminal drafts", () => {
		expect(terminalStdoutEvent({ data: "out", runId: "run_1" })).toMatchObject({
			payload: { data: "out" },
			type: "terminal.stdout",
			visibility: "local-only",
		});
		expect(terminalStderrEvent({ data: "err", runId: "run_1" })).toMatchObject({
			payload: { data: "err" },
			type: "terminal.stderr",
			visibility: "local-only",
		});
		expect(terminalClosedEvent({ exitCode: 1, runId: "run_1", signal: "SIGTERM" })).toMatchObject({
			payload: { exitCode: 1, signal: "SIGTERM" },
			type: "terminal.closed",
			visibility: "metadata",
		});
		expect(terminalClosedEvent({ runId: "run_1" })).toMatchObject({
			payload: {},
			type: "terminal.closed",
		});
	});

	it("creates normalized tool and approval drafts", () => {
		expect(toolStartEvent({ risk: "high", runId: "run_1", toolCallId: "tool_1", toolName: "bash" })).toMatchObject({
			payload: { risk: "high", toolCallId: "tool_1", toolName: "bash" },
			type: "tool.start",
		});
		expect(toolDeltaEvent({ delta: "partial", runId: "run_1", toolCallId: "tool_1" })).toMatchObject({
			payload: { delta: "partial", toolCallId: "tool_1" },
			type: "tool.delta",
		});
		expect(toolEndEvent({ runId: "run_1", status: "success", toolCallId: "tool_1" })).toMatchObject({
			payload: { status: "success", toolCallId: "tool_1" },
			type: "tool.end",
		});
		expect(toolEndEvent({ resultRef: "r2://tool", runId: "run_1", status: "error", toolCallId: "tool_1" })).toMatchObject({
			payload: { resultRef: "r2://tool", status: "error", toolCallId: "tool_1" },
			type: "tool.end",
		});
		expect(toolErrorEvent({ error: "boom", runId: "run_1", toolCallId: "tool_1" })).toMatchObject({
			payload: { error: "boom", toolCallId: "tool_1" },
			type: "tool.error",
		});
		expect(approvalRequestedEvent({ approvalId: "app_1", risk: "critical", runId: "run_1", title: "Deploy" })).toMatchObject({
			payload: { approvalId: "app_1", risk: "critical", title: "Deploy" },
			type: "approval.requested",
		});
	});

	it("stringifies JSON values without wrapping strings", () => {
		expect(stringifyJsonValue("ready")).toBe("ready");
		expect(stringifyJsonValue({ ok: true })).toBe("{\"ok\":true}");
	});
});
