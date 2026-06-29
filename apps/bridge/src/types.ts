import type {
	AgentCapability,
	AgentDeckEvent,
	AgentKind,
	PrivacyMode,
	TerminalLeaseMode,
} from "@agentdeck/core";
import type {
	AgentAuthStatus as HarnessAgentAuthStatus,
	HarnessEventDraft,
	JsonPrimitive as HarnessJsonPrimitive,
	JsonValue as HarnessJsonValue,
} from "@agentdeck/harness";

export const BRIDGE_VERSION = "0.1.0";

export type AgentAuthStatus = HarnessAgentAuthStatus;

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
	repoPath?: string;
	sessionId: string;
	worktreeBaseDir?: string;
};

export type BridgeEventDraft<TType extends AgentDeckEvent["type"] = AgentDeckEvent["type"]> = HarnessEventDraft<TType>;

export type JsonPrimitive = HarnessJsonPrimitive;
export type JsonValue = HarnessJsonValue;

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
