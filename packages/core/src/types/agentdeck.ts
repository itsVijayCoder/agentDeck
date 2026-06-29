export type PrivacyMode = "local-only" | "metadata-only" | "full-sync";

export type RunStatus =
	| "draft"
	| "queued"
	| "waiting-machine"
	| "running"
	| "waiting-approval"
	| "paused"
	| "verifying"
	| "completed"
	| "failed"
	| "cancelled";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type AgentKind = "claude-code" | "codex" | "opencode" | "qwen-code" | "pi" | "aider" | "acp";

export type AgentCapability =
	| "terminal"
	| "repo-aware"
	| "code-edit"
	| "bash"
	| "mcp"
	| "acp"
	| "json-events"
	| "rpc"
	| "sdk"
	| "model-switching"
	| "session-branching"
	| "message-queue"
	| "custom-tools";

export type AgentStatus = "ready" | "running" | "waiting" | "passed" | "idle" | "missing" | "auth-missing";

export type VerificationStatus = "passed" | "warning" | "failed" | "pending";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type QueuePriority = "low" | "normal" | "high" | "urgent";

export type NavigationItem = {
	id: string;
	label: string;
	count?: number;
};

export type WorkspaceSummary = {
	id: string;
	name: string;
	repo: string;
	branch: string;
	privacyMode: PrivacyMode;
	machineCount: number;
	costTodayUsd: number;
	pendingApprovals: number;
};

export type AgentInstallation = {
	id: string;
	kind: AgentKind;
	name: string;
	command: string;
	version?: string;
	status: AgentStatus;
	authStatus: "unknown" | "configured" | "missing" | "expired";
	capabilities: AgentCapability[];
	latencyMs?: number;
	lastSeenLabel: string;
	recommendedFor: string;
};

export type GraphNodeStatus = "complete" | "running" | "waiting" | "blocked" | "idle";

export type AgentGraphNode = {
	id: string;
	label: string;
	subtitle: string;
	status: GraphNodeStatus;
	metric: string;
	x: number;
	y: number;
};

export type AgentGraphEdge = {
	id: string;
	from: string;
	to: string;
	status: "active" | "complete" | "waiting";
};

export type TerminalTabStatus = "running" | "waiting" | "passed" | "idle" | "failed";

export type TerminalTab = {
	id: string;
	label: string;
	runId: string;
	status: TerminalTabStatus;
	lines: TerminalLine[];
};

export type TerminalLine = {
	id: string;
	prompt?: string;
	text: string;
	tone?: "default" | "muted" | "success" | "warning" | "danger" | "info";
	timestamp: string;
};

export type TerminalLeaseMode = "agent-control" | "human-control" | "read-only";

export type VerificationResult = {
	id: string;
	label: string;
	command: string;
	status: VerificationStatus;
	summary: string;
	durationLabel: string;
};

export type ApprovalRequest = {
	id: string;
	kind: "command" | "provider" | "file" | "queue" | "patch";
	title: string;
	description: string;
	risk: RiskLevel;
	status: ApprovalStatus;
	requestedBy: string;
	createdLabel: string;
};

export type TimelineEvent = {
	id: string;
	title: string;
	description: string;
	status: GraphNodeStatus;
	timeLabel: string;
	source: "browser" | "bridge" | "agent" | "verifier" | "worker";
};

export type ActiveRun = {
	id: string;
	sessionId: string;
	title: string;
	task: string;
	status: RunStatus;
	worktreeLabel: string;
	branchName: string;
	agentControlLabel: string;
	confidence: number;
	costUsd: number;
	latencyLabel: string;
	risk: RiskLevel;
	graphNodes: AgentGraphNode[];
	graphEdges: AgentGraphEdge[];
	timeline: TimelineEvent[];
	verification: VerificationResult[];
	approvals: ApprovalRequest[];
	terminalTabs: TerminalTab[];
};

export type QueueItem = {
	id: string;
	task: string;
	repo: string;
	branch: string;
	agent: string;
	priority: QueuePriority;
	status: RunStatus;
	scheduleWindow: string;
	estimate: string;
	risk: RiskLevel;
};

export type ScheduledJob = {
	id: string;
	name: string;
	naturalLanguage: string;
	cron: string;
	timezone: string;
	nextRunLabel: string;
	lastStatus: "success" | "failed" | "cancelled" | "never-run";
	enabled: boolean;
};

export type DecisionReport = {
	id: string;
	sessionId: string;
	summary: string;
	recommendation: "accept" | "review-carefully" | "reject" | "rerun";
	confidence: number;
	agentsUsed: string[];
	filesChanged: number;
	commandsRun: number;
	humanInterventions: number;
	costUsd: number;
	latencyLabel: string;
};

export type PolicyRule = {
	id: string;
	action: string;
	defaultDecision: "allow" | "approval" | "deny";
	reason: string;
	risk: RiskLevel;
};
