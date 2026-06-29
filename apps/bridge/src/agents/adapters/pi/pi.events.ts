import type { AgentKind, RiskLevel } from "@agentdeck/core";
import {
	agentEndedEvent,
	agentStartedEvent,
	approvalRequestedEvent,
	assistantDeltaEvent,
	assistantEndEvent,
	assistantStartEvent,
	queuedMessageEvent,
	stringifyJsonValue,
	terminalClosedEvent,
	terminalStderrEvent,
	terminalStdoutEvent,
	toolDeltaEvent,
	toolEndEvent,
	toolErrorEvent,
	toolStartEvent,
	type HarnessEventDraft,
	type HarnessMode,
	type JsonValue,
	type SteeringDeliveryPolicy,
} from "@agentdeck/harness";
import { classifyCommandRisk } from "@agentdeck/policy";

import { redactStructured } from "../../../redaction/secrets.js";

type PiEventContext = {
	agentKind?: AgentKind;
	harnessMode: HarnessMode | string;
	runId: string;
};

export function mapPiEventToAgentDeck(event: unknown, ctx: PiEventContext): HarnessEventDraft[] {
	if (!isRecord(event)) {
		return [];
	}

	const type = stringField(event, "type");
	const agentKind = ctx.agentKind ?? "pi";

	switch (type) {
		case "session":
		case "agent_start":
			return [agentStartedEvent({ agentKind, harnessMode: ctx.harnessMode, runId: ctx.runId })];
		case "agent_end":
			return [
				agentEndedEvent({
					agentKind,
					runId: ctx.runId,
					status: agentEndStatus(event),
				}),
			];
		case "message_start":
			return [
				assistantStartEvent({
					agentKind,
					messageId: messageIdFrom(event, ctx.runId),
					runId: ctx.runId,
				}),
			];
		case "message_update":
			return mapPiMessageUpdate(event, ctx.runId);
		case "assistant_delta":
		case "text_delta":
		case "thinking_delta":
			return mapAssistantDelta(event, ctx.runId);
		case "message_end":
			return [
				assistantEndEvent({
					contentRef: stringField(event, "contentRef"),
					messageId: messageIdFrom(event, ctx.runId),
					runId: ctx.runId,
				}),
			];
		case "tool_execution_start":
		case "tool_start":
			return [
				toolStartEvent({
					risk: inferToolRisk(event),
					runId: ctx.runId,
					toolCallId: toolCallIdFrom(event, ctx.runId),
					toolName: stringField(event, "toolName") ?? stringField(event, "name") ?? "tool",
				}),
			];
		case "tool_execution_update":
		case "tool_delta":
			return [
				toolDeltaEvent({
					delta: stringifyJsonValue(redactedJsonValue(recordField(event, "partialResult") ?? event.delta ?? "")),
					runId: ctx.runId,
					toolCallId: toolCallIdFrom(event, ctx.runId),
				}),
			];
		case "tool_execution_end":
		case "tool_end":
			return [
				toolEndEvent({
					resultRef: stringField(event, "resultRef"),
					runId: ctx.runId,
					status: booleanField(event, "isError") ? "error" : "success",
					toolCallId: toolCallIdFrom(event, ctx.runId),
				}),
			];
		case "tool_error":
			return [
				toolErrorEvent({
					error: stringField(event, "error") ?? "Tool failed.",
					runId: ctx.runId,
					toolCallId: toolCallIdFrom(event, ctx.runId),
				}),
			];
		case "approval_request":
		case "approval_requested":
			return [
				approvalRequestedEvent({
					approvalId: stringField(event, "approvalId") ?? stringField(event, "id") ?? `approval-${ctx.runId}`,
					risk: riskField(event, "risk") ?? "medium",
					runId: ctx.runId,
					title: stringField(event, "title") ?? "Agent approval requested",
				}),
			];
		case "queue_update":
			return [
				queuedMessageEvent({
					deliveryPolicy: deliveryPolicyFrom(event),
					messageId: stringField(event, "messageId") ?? `queued-${ctx.runId}`,
					runId: ctx.runId,
				}),
			];
		case "final_message":
			return mapFinalMessage(event, ctx);
		case "stdout":
			return [terminalStdoutEvent({ data: stringField(event, "data") ?? "", runId: ctx.runId })];
		case "stderr":
			return [terminalStderrEvent({ data: stringField(event, "data") ?? "", runId: ctx.runId })];
		case "process_exit":
			return [
				terminalClosedEvent({
					exitCode: numberField(event, "exitCode"),
					runId: ctx.runId,
					signal: stringField(event, "signal"),
				}),
			];
		case "error":
			return [terminalStderrEvent({ data: stringField(event, "message") ?? "Agent error.", runId: ctx.runId })];
		default:
			return [];
	}
}

function mapPiMessageUpdate(event: Record<string, unknown>, runId: string): HarnessEventDraft[] {
	const inner = recordField(event, "assistantMessageEvent") ?? event;
	return mapAssistantDelta(inner, runId, messageIdFrom(event, runId));
}

function mapAssistantDelta(event: Record<string, unknown>, runId: string, messageId = messageIdFrom(event, runId)): HarnessEventDraft[] {
	const delta = stringField(event, "delta") ?? stringField(event, "text") ?? stringField(event, "content");
	if (!delta) {
		return [];
	}

	return [assistantDeltaEvent({ delta, messageId, runId })];
}

function mapFinalMessage(event: Record<string, unknown>, ctx: PiEventContext): HarnessEventDraft[] {
	const messageId = messageIdFrom(event, ctx.runId);
	const content = stringField(event, "content") ?? stringField(event, "text");
	const events: HarnessEventDraft[] = [];
	if (content) {
		events.push(assistantDeltaEvent({ delta: content, messageId, runId: ctx.runId }));
	}
	events.push(assistantEndEvent({ messageId, runId: ctx.runId }));
	events.push(agentEndedEvent({ agentKind: ctx.agentKind ?? "pi", runId: ctx.runId, status: "completed" }));
	return events;
}

function agentEndStatus(event: Record<string, unknown>): "cancelled" | "completed" | "failed" {
	const status = stringField(event, "status");
	if (status === "cancelled" || status === "failed") {
		return status;
	}
	return "completed";
}

function inferToolRisk(event: Record<string, unknown>): RiskLevel {
	const toolName = (stringField(event, "toolName") ?? stringField(event, "name") ?? "").toLowerCase();
	const args = recordField(event, "args");
	const command = args ? stringField(args, "command") ?? stringField(args, "cmd") ?? stringField(args, "input") : undefined;

	if (command) {
		return classifyCommandRisk(command).risk;
	}

	return toolName.includes("bash") || toolName.includes("shell") || toolName.includes("terminal") ? "high" : "medium";
}

function messageIdFrom(event: Record<string, unknown>, runId: string): string {
	return stringField(event, "messageId") ?? stringField(event, "id") ?? `msg-${runId}`;
}

function toolCallIdFrom(event: Record<string, unknown>, runId: string): string {
	return stringField(event, "toolCallId") ?? stringField(event, "id") ?? `tool-${runId}`;
}

function deliveryPolicyFrom(event: Record<string, unknown>): SteeringDeliveryPolicy {
	const deliveryPolicy = stringField(event, "deliveryPolicy");
	if (
		deliveryPolicy === "after-current-tool" ||
		deliveryPolicy === "after-current-turn" ||
		deliveryPolicy === "after-run-completes"
	) {
		return deliveryPolicy;
	}

	return "after-current-turn";
}

function redactedJsonValue(value: unknown): JsonValue {
	return redactStructured(toJsonValue(value)).value;
}

function toJsonValue(value: unknown): JsonValue {
	if (value === null) {
		return null;
	}

	switch (typeof value) {
		case "string":
		case "boolean":
			return value;
		case "number":
			return Number.isFinite(value) ? value : null;
		case "object":
			if (Array.isArray(value)) {
				return value.map(toJsonValue);
			}
			if (!isRecord(value)) {
				return null;
			}
			return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, toJsonValue(nested)]));
		default:
			return null;
	}
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanField(record: Record<string, unknown>, key: string): boolean {
	return record[key] === true;
}

function riskField(record: Record<string, unknown>, key: string): RiskLevel | undefined {
	const value = record[key];
	return value === "low" || value === "medium" || value === "high" || value === "critical" ? value : undefined;
}

function recordField(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
	const value = record[key];
	return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
