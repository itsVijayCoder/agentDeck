import type { AgentKind, RiskLevel } from "@agentdeck/core";

import type {
	HarnessEventDraft,
	HarnessMode,
	JsonValue,
	SteeringDeliveryPolicy,
} from "./types.js";

export function agentStartedEvent(input: {
	agentKind: AgentKind;
	harnessMode: HarnessMode | string;
	runId: string;
}): HarnessEventDraft<"agent.started"> {
	return {
		payload: {
			agentKind: input.agentKind,
			harnessMode: input.harnessMode,
		},
		runId: input.runId,
		source: "agent",
		type: "agent.started",
		visibility: "metadata",
	};
}

export function agentEndedEvent(input: {
	agentKind: AgentKind;
	runId: string;
	status: "cancelled" | "completed" | "failed";
}): HarnessEventDraft<"agent.ended"> {
	return {
		payload: {
			agentKind: input.agentKind,
			status: input.status,
		},
		runId: input.runId,
		source: "agent",
		type: "agent.ended",
		visibility: "metadata",
	};
}

export function assistantStartEvent(input: {
	agentKind: AgentKind;
	messageId: string;
	runId: string;
}): HarnessEventDraft<"message.assistant_start"> {
	return {
		payload: {
			agentKind: input.agentKind,
			messageId: input.messageId,
		},
		runId: input.runId,
		source: "agent",
		type: "message.assistant_start",
		visibility: "metadata",
	};
}

export function assistantDeltaEvent(input: {
	delta: string;
	messageId: string;
	runId: string;
}): HarnessEventDraft<"message.assistant_delta"> {
	return {
		payload: {
			delta: input.delta,
			messageId: input.messageId,
		},
		runId: input.runId,
		source: "agent",
		type: "message.assistant_delta",
		visibility: "local-only",
	};
}

export function assistantEndEvent(input: {
	contentRef?: string;
	messageId: string;
	runId: string;
}): HarnessEventDraft<"message.assistant_end"> {
	return {
		payload: {
			messageId: input.messageId,
			...(input.contentRef ? { contentRef: input.contentRef } : {}),
		},
		runId: input.runId,
		source: "agent",
		type: "message.assistant_end",
		visibility: input.contentRef ? "metadata" : "local-only",
	};
}

export function queuedMessageEvent(input: {
	deliveryPolicy: SteeringDeliveryPolicy;
	messageId: string;
	runId: string;
}): HarnessEventDraft<"message.queued"> {
	return {
		payload: {
			deliveryPolicy: input.deliveryPolicy,
			messageId: input.messageId,
		},
		runId: input.runId,
		source: "agent",
		type: "message.queued",
		visibility: "metadata",
	};
}

export function deliveredMessageEvent(input: {
	messageId: string;
	runId: string;
}): HarnessEventDraft<"message.delivered"> {
	return {
		payload: {
			messageId: input.messageId,
		},
		runId: input.runId,
		source: "agent",
		type: "message.delivered",
		visibility: "metadata",
	};
}

export function terminalStdoutEvent(input: {
	data: string;
	runId: string;
}): HarnessEventDraft<"terminal.stdout"> {
	return {
		payload: {
			data: input.data,
		},
		runId: input.runId,
		source: "bridge",
		type: "terminal.stdout",
		visibility: "local-only",
	};
}

export function terminalStderrEvent(input: {
	data: string;
	runId: string;
}): HarnessEventDraft<"terminal.stderr"> {
	return {
		payload: {
			data: input.data,
		},
		runId: input.runId,
		source: "bridge",
		type: "terminal.stderr",
		visibility: "local-only",
	};
}

export function terminalClosedEvent(input: {
	exitCode?: number;
	runId: string;
	signal?: string;
}): HarnessEventDraft<"terminal.closed"> {
	return {
		payload: {
			...(input.exitCode === undefined ? {} : { exitCode: input.exitCode }),
			...(input.signal ? { signal: input.signal } : {}),
		},
		runId: input.runId,
		source: "bridge",
		type: "terminal.closed",
		visibility: "metadata",
	};
}

export function toolStartEvent(input: {
	risk: RiskLevel;
	runId: string;
	toolCallId: string;
	toolName: string;
}): HarnessEventDraft<"tool.start"> {
	return {
		payload: {
			risk: input.risk,
			toolCallId: input.toolCallId,
			toolName: input.toolName,
		},
		runId: input.runId,
		source: "agent",
		type: "tool.start",
		visibility: "metadata",
	};
}

export function toolDeltaEvent(input: {
	delta: string;
	runId: string;
	toolCallId: string;
}): HarnessEventDraft<"tool.delta"> {
	return {
		payload: {
			delta: input.delta,
			toolCallId: input.toolCallId,
		},
		runId: input.runId,
		source: "agent",
		type: "tool.delta",
		visibility: "local-only",
	};
}

export function toolEndEvent(input: {
	resultRef?: string;
	runId: string;
	status: "error" | "success";
	toolCallId: string;
}): HarnessEventDraft<"tool.end"> {
	return {
		payload: {
			...(input.resultRef ? { resultRef: input.resultRef } : {}),
			status: input.status,
			toolCallId: input.toolCallId,
		},
		runId: input.runId,
		source: "agent",
		type: "tool.end",
		visibility: "metadata",
	};
}

export function toolErrorEvent(input: {
	error: string;
	runId: string;
	toolCallId: string;
}): HarnessEventDraft<"tool.error"> {
	return {
		payload: {
			error: input.error,
			toolCallId: input.toolCallId,
		},
		runId: input.runId,
		source: "agent",
		type: "tool.error",
		visibility: "metadata",
	};
}

export function approvalRequestedEvent(input: {
	approvalId: string;
	risk: RiskLevel;
	runId: string;
	title: string;
}): HarnessEventDraft<"approval.requested"> {
	return {
		payload: {
			approvalId: input.approvalId,
			risk: input.risk,
			title: input.title,
		},
		runId: input.runId,
		source: "agent",
		type: "approval.requested",
		visibility: "metadata",
	};
}

export function stringifyJsonValue(value: JsonValue): string {
	if (typeof value === "string") {
		return value;
	}

	return JSON.stringify(value);
}
