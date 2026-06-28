import type { BrowserControlMessage, BridgeMessage, EventEnvelope } from "@agentdeck/core";

export const SESSION_HUB_CLIENT_ROLES = ["browser", "bridge", "observer"] as const;
export type SessionHubClientRole = (typeof SESSION_HUB_CLIENT_ROLES)[number];

export const SESSION_HUB_RECENT_EVENT_LIMIT = 500;
export const SESSION_HUB_LARGE_PAYLOAD_BYTES = 16 * 1024;

export type SessionHubConnectionEstablished = {
	type: "connection.established";
	clientId: string;
	connectedAt: string;
	lastSeq: number;
	replayed: number;
	role: SessionHubClientRole;
	sessionId: string;
};

export type SessionHubErrorCode =
	| "BAD_MESSAGE"
	| "BRIDGE_UNAVAILABLE"
	| "CONFLICT"
	| "FORBIDDEN"
	| "INVALID_ROLE"
	| "NOT_FOUND"
	| "PERSISTENCE_ERROR"
	| "UNAUTHORIZED"
	| "VALIDATION_ERROR";

export type SessionHubErrorMessage = {
	type: "error";
	code: SessionHubErrorCode;
	message: string;
};

export type SessionHubServerMessage =
	| EventEnvelope
	| SessionHubConnectionEstablished
	| SessionHubErrorMessage;

export type SessionHubClientMessage = BrowserControlMessage | BridgeMessage | EventEnvelope;

export function isSessionHubClientRole(value: string | null): value is SessionHubClientRole {
	return SESSION_HUB_CLIENT_ROLES.includes(value as SessionHubClientRole);
}
