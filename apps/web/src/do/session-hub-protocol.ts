import type {
	BrowserControlMessage,
	BridgeArtifactUploadMessage,
	EventSource,
	EventVisibility,
	AgentDeckEvent,
	PrivacyMode,
	RunStatus,
	TerminalLeaseMode,
} from "@agentdeck/core";
import { SESSION_HUB_LARGE_PAYLOAD_BYTES } from "@agentdeck/bridge-protocol";
import { getPrivacyStorageDecision } from "@agentdeck/policy";
import type { JsonValue } from "@agentdeck/db";

const runStatuses = [
	"draft",
	"queued",
	"waiting-machine",
	"running",
	"waiting-approval",
	"paused",
	"verifying",
	"completed",
	"failed",
	"cancelled",
] as const satisfies readonly RunStatus[];

const terminalLeaseModes = ["agent-control", "human-control", "read-only"] as const satisfies readonly TerminalLeaseMode[];

export const SESSION_HUB_HEADERS = {
	clientRole: "x-agentdeck-client-role",
	machineId: "x-agentdeck-machine-id",
	sessionId: "x-agentdeck-session-id",
	userId: "x-agentdeck-user-id",
	workspaceId: "x-agentdeck-workspace-id",
} as const;

export type SessionHubEventDraft = {
	payload: JsonValue;
	runId?: string;
	source: EventSource;
	type: AgentDeckEvent["type"];
	visibility?: EventVisibility;
};

export function bridgeMessageToEventDrafts(message: unknown): SessionHubEventDraft[] | null {
	if (!isJsonRecord(message) || typeof message.type !== "string") {
		return null;
	}

	switch (message.type) {
		case "event.batch": {
			if (!Array.isArray(message.events)) {
				return null;
			}

			const drafts = message.events.map((event) => inboundEventToDraft(event, "bridge"));
			return drafts.every((draft): draft is SessionHubEventDraft => draft !== null) ? drafts : null;
		}
		case "machine.heartbeat": {
			if (typeof message.machineId !== "string" || typeof message.sentAt !== "string") {
				return null;
			}

			return [
				{
					payload: { machineId: message.machineId, sentAt: message.sentAt },
					source: "bridge",
					type: "machine.heartbeat",
					visibility: "metadata",
				},
			];
		}
		case "agent.detected": {
			if (typeof message.agentKind !== "string" || typeof message.command !== "string") {
				return null;
			}

			return [
				{
					payload: {
						agentKind: message.agentKind,
						command: message.command,
						...(typeof message.version === "string" ? { version: message.version } : {}),
					},
					source: "bridge",
					type: "agent.detected",
					visibility: "metadata",
				},
			];
		}
		case "run.status": {
			if (typeof message.runId !== "string" || !isRunStatus(message.status)) {
				return null;
			}

			return [
				{
					payload: { runId: message.runId, status: message.status },
					runId: message.runId,
					source: "bridge",
					type: "run.status",
					visibility: "metadata",
				},
			];
		}
		default:
			return singleDraftOrNull(inboundEventToDraft(message, "bridge"));
	}
}

export function parseBridgeArtifactUploadMessage(message: unknown): BridgeArtifactUploadMessage | null {
	if (!isJsonRecord(message) || message.type !== "artifact.upload") {
		return null;
	}

	if (
		typeof message.data !== "string" ||
		typeof message.kind !== "string" ||
		typeof message.mimeType !== "string" ||
		typeof message.objectKey !== "string"
	) {
		return null;
	}

	if (
		message.redactionStatus !== undefined &&
		message.redactionStatus !== "none" &&
		message.redactionStatus !== "redacted"
	) {
		return null;
	}

	return {
		data: message.data,
		kind: message.kind,
		mimeType: message.mimeType,
		objectKey: message.objectKey,
		...(typeof message.artifactId === "string" ? { artifactId: message.artifactId } : {}),
		...(message.redactionStatus ? { redactionStatus: message.redactionStatus } : {}),
		...(typeof message.runId === "string" ? { runId: message.runId } : {}),
		type: "artifact.upload",
	};
}

export function parseBrowserControlMessage(message: unknown): BrowserControlMessage | null {
	if (!isJsonRecord(message) || typeof message.type !== "string") {
		return null;
	}

	switch (message.type) {
		case "control.pause":
		case "control.resume":
		case "control.cancel":
			return typeof message.runId === "string"
				? {
						type: message.type,
						runId: message.runId,
						...(typeof message.reason === "string" ? { reason: message.reason } : {}),
					}
				: null;
		case "terminal.stdin":
			return typeof message.runId === "string" && typeof message.data === "string"
				? { type: "terminal.stdin", data: message.data, runId: message.runId }
				: null;
		case "terminal.resize":
			return typeof message.runId === "string" && isPositiveInteger(message.cols) && isPositiveInteger(message.rows)
				? { type: "terminal.resize", cols: message.cols, rows: message.rows, runId: message.runId }
				: null;
		case "terminal.lease.request":
			return typeof message.runId === "string" && isTerminalLeaseMode(message.mode)
				? { type: "terminal.lease.request", mode: message.mode, runId: message.runId }
				: null;
		case "terminal.lease.release":
			return typeof message.runId === "string" && typeof message.leaseId === "string"
				? { type: "terminal.lease.release", leaseId: message.leaseId, runId: message.runId }
				: null;
		case "message.steer":
		case "message.follow_up":
			return typeof message.runId === "string" && typeof message.content === "string"
				? { type: message.type, content: message.content, runId: message.runId }
				: null;
		case "approval.decide":
			return typeof message.approvalId === "string" && (message.status === "approved" || message.status === "rejected")
				? {
						type: "approval.decide",
						approvalId: message.approvalId,
						status: message.status,
						...(typeof message.notes === "string" ? { notes: message.notes } : {}),
					}
				: null;
		default:
			return null;
	}
}

export function browserControlToEventDraft(
	message: BrowserControlMessage,
	userId: string,
	approvalRunId?: string,
): SessionHubEventDraft | null {
	switch (message.type) {
		case "control.pause":
			return {
				payload: message.reason ? { reason: message.reason } : {},
				runId: message.runId,
				source: "browser",
				type: "run.paused",
				visibility: "metadata",
			};
		case "control.resume":
			return {
				payload: message.reason ? { reason: message.reason } : {},
				runId: message.runId,
				source: "browser",
				type: "run.resumed",
				visibility: "metadata",
			};
		case "control.cancel":
			return {
				payload: message.reason ? { reason: message.reason } : {},
				runId: message.runId,
				source: "browser",
				type: "run.cancelled",
				visibility: "metadata",
			};
		case "terminal.lease.request":
			return {
				payload: { mode: message.mode, requestedBy: userId },
				runId: message.runId,
				source: "browser",
				type: "terminal.lease_requested",
				visibility: "metadata",
			};
		case "terminal.lease.release":
			return {
				payload: { leaseId: message.leaseId },
				runId: message.runId,
				source: "browser",
				type: "terminal.lease_released",
				visibility: "metadata",
			};
		case "approval.decide":
			return {
				payload:
					message.status === "approved"
						? { approvalId: message.approvalId, decidedBy: userId, status: "approved" }
						: message.notes
							? { approvalId: message.approvalId, decidedBy: userId, reason: message.notes }
							: { approvalId: message.approvalId, decidedBy: userId },
				runId: approvalRunId,
				source: "browser",
				type: message.status === "approved" ? "approval.approved" : "approval.rejected",
				visibility: "metadata",
			};
		default:
			return null;
	}
}

export function browserControlForBridge(message: BrowserControlMessage, userId: string): BrowserControlMessage {
	switch (message.type) {
		case "terminal.stdin":
		case "terminal.lease.request":
		case "approval.decide":
			return { ...message, userId };
		default:
			return message;
	}
}

export function visibilityForEvent(type: AgentDeckEvent["type"], privacyMode: PrivacyMode): EventVisibility {
	if (privacyMode === "full-sync") {
		return "full";
	}

	if (privacyMode === "local-only" || type.startsWith("terminal.")) {
		return "local-only";
	}

	return "metadata";
}

export function shouldStorePayloadInR2(input: {
	payloadBytes: number;
	privacyMode: PrivacyMode;
	type: AgentDeckEvent["type"];
}): boolean {
	const decision = getPrivacyStorageDecision(input.privacyMode);
	if (decision.r2 === "blocked") {
		return false;
	}

	if (input.type === "terminal.stdout" || input.type === "terminal.stderr") {
		return true;
	}

	return input.payloadBytes > SESSION_HUB_LARGE_PAYLOAD_BYTES;
}

export function isJsonValue(value: unknown): value is JsonValue {
	if (value === null) {
		return true;
	}

	switch (typeof value) {
		case "string":
		case "boolean":
			return true;
		case "number":
			return Number.isFinite(value);
		case "object":
			if (Array.isArray(value)) {
				return value.every(isJsonValue);
			}
			return isJsonRecord(value) && Object.values(value).every(isJsonValue);
		default:
			return false;
	}
}

function inboundEventToDraft(message: unknown, defaultSource: EventSource): SessionHubEventDraft | null {
	if (!isJsonRecord(message) || typeof message.type !== "string" || !isJsonValue(message.payload)) {
		return null;
	}

	return {
		payload: message.payload,
		runId: typeof message.runId === "string" ? message.runId : runIdFromPayload(message.payload),
		source: isEventSource(message.source) ? message.source : defaultSource,
		type: message.type as AgentDeckEvent["type"],
		visibility: isEventVisibility(message.visibility) ? message.visibility : undefined,
	};
}

function singleDraftOrNull(draft: SessionHubEventDraft | null): SessionHubEventDraft[] | null {
	return draft ? [draft] : null;
}

function runIdFromPayload(payload: JsonValue): string | undefined {
	return isJsonRecord(payload) && typeof payload.runId === "string" ? payload.runId : undefined;
}

function isJsonRecord(value: unknown): value is { [key: string]: unknown } {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isEventSource(value: unknown): value is EventSource {
	return (
		value === "browser" ||
		value === "worker" ||
		value === "durable-object" ||
		value === "bridge" ||
		value === "agent" ||
		value === "verifier" ||
		value === "ai-gateway"
	);
}

function isEventVisibility(value: unknown): value is EventVisibility {
	return value === "local-only" || value === "metadata" || value === "full";
}

function isPositiveInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRunStatus(value: unknown): value is RunStatus {
	return runStatuses.includes(value as RunStatus);
}

function isTerminalLeaseMode(value: unknown): value is TerminalLeaseMode {
	return terminalLeaseModes.includes(value as TerminalLeaseMode);
}
