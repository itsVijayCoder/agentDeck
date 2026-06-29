import type {
	AgentCapability,
	AgentDeckEvent,
	AgentDeckEventType,
	AgentKind,
	EventSource,
	EventVisibility,
	PrivacyMode,
	TerminalLeaseMode,
} from "@agentdeck/core";

export type AgentInstallSource = "path" | "npm" | "brew" | "pipx" | "cargo" | "winget" | "manual";

export type AgentAuthStatus = "unknown" | "configured" | "missing" | "expired";

export type ProbeResult = {
	agentKind: AgentKind;
	authStatus: AgentAuthStatus;
	capabilities: AgentCapability[];
	command?: string;
	found: boolean;
	installSource?: AgentInstallSource;
	suggestedFix?: string;
	version?: string;
	warnings: string[];
};

export type HarnessSessionContext = {
	cwd: string;
	privacyMode: PrivacyMode;
	runId: string;
	sessionId: string;
	workspaceId: string;
	worktreePath?: string;
};

export type HarnessTask = {
	images?: Array<{ base64: string; mimeType: string }>;
	model?: string;
	prompt: string;
	provider?: string;
};

export type SteeringDeliveryPolicy = "after-current-tool" | "after-current-turn" | "after-run-completes";

export type UserSteeringMessage = {
	content: string;
	deliveryPolicy: SteeringDeliveryPolicy;
	kind: "steer-now" | "follow-up";
};

export type TerminalInput = {
	data: string;
	userId: string;
};

export type ApprovalDecision = {
	notes?: string;
	status: "approved" | "rejected";
};

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type HarnessEventDraft<
	TType extends AgentDeckEventType = AgentDeckEventType,
	TPayload extends JsonValue = JsonValue,
> = {
	payload: TPayload;
	runId?: string;
	source?: EventSource;
	type: TType;
	visibility?: EventVisibility;
};

export type EventSink = {
	emit(event: HarnessEventDraft): void;
	flush(): Promise<void>;
};

export type HarnessMode =
	| "pty"
	| "json"
	| "rpc"
	| "sdk"
	| "acp-stdio"
	| "claude-code-pty"
	| "codex-pty"
	| "opencode-pty"
	| "qwen-code-pty"
	| "aider-pty";

export interface HarnessAdapter {
	readonly displayName: string;
	readonly id: string;
	readonly kind: AgentKind;

	createSession(ctx: HarnessSessionContext): Promise<HarnessSessionHandle>;
	probe(): Promise<ProbeResult>;
}

export interface HarnessSessionHandle {
	readonly agentKind: AgentKind;
	readonly runId: string;

	approve(requestId: string, decision: ApprovalDecision): Promise<void>;
	cancel(reason: string): Promise<void>;
	dispose(): Promise<void>;
	pause(): Promise<void>;
	resume(): Promise<void>;
	sendTerminalInput(input: TerminalInput): Promise<void>;
	sendUserMessage(message: UserSteeringMessage): Promise<void>;
	start(task: HarnessTask, sink: EventSink): Promise<void>;
}

export type NormalizedAgentEvent = Extract<
	AgentDeckEvent,
	| { type: "agent.started" }
	| { type: "agent.ended" }
	| { type: "message.assistant_start" }
	| { type: "message.assistant_delta" }
	| { type: "message.assistant_end" }
	| { type: "message.queued" }
	| { type: "message.delivered" }
	| { type: "tool.start" }
	| { type: "tool.delta" }
	| { type: "tool.end" }
	| { type: "tool.error" }
	| { type: "approval.requested" }
	| { type: "terminal.stdout" }
	| { type: "terminal.stderr" }
	| { type: "terminal.closed" }
>;

export type TerminalDimensions = {
	cols: number;
	rows: number;
};

export type SupportsTerminalControl = {
	getState(): {
		leaseId?: string;
		leaseMode: TerminalLeaseMode;
		pid?: number;
		runId: string;
		started: boolean;
	};
};
