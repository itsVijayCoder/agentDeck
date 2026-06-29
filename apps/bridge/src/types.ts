import type {
	AgentCapability,
	AgentDeckEvent,
	AgentKind,
	EventSource,
	EventVisibility,
	PrivacyMode,
	TerminalLeaseMode,
} from "@agentdeck/core";

export const BRIDGE_VERSION = "0.1.0";

export type AgentAuthStatus = "unknown" | "configured" | "missing" | "expired";

export type BridgeConfig = {
	cloudUrl: string;
	defaultSessionId?: string;
	displayName: string;
	machineId: string;
	pairedAt: string;
	privacyMode: PrivacyMode;
	token: string;
	workspaceId: string;
};

export type BridgeRuntimeOptions = {
	heartbeatIntervalMs?: number;
	privacyMode?: PrivacyMode;
	sessionId: string;
};

export type BridgeEventDraft<TType extends AgentDeckEvent["type"] = AgentDeckEvent["type"]> = {
	payload: JsonValue;
	runId?: string;
	source?: EventSource;
	type: TType;
	visibility?: EventVisibility;
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type TerminalControlState = {
	leaseId?: string;
	mode: TerminalLeaseMode;
};

export type DetectedAgentForPairing = {
	authStatus: AgentAuthStatus;
	capabilities: AgentCapability[];
	command: string;
	id?: string;
	kind: AgentKind;
	version?: string | null;
};
