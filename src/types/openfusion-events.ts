import type {
	AgentKind,
	ApprovalStatus,
	PrivacyMode,
	RiskLevel,
	RunStatus,
	TerminalLeaseMode,
	VerificationStatus,
} from "@/types/openfusion";

export type EventSource = "browser" | "worker" | "durable-object" | "bridge" | "agent" | "verifier" | "ai-gateway";

export type EventVisibility = "local-only" | "metadata" | "full";

export type EventEnvelope<TType extends string = string, TPayload = unknown> = {
	id: string;
	seq: number;
	workspaceId: string;
	sessionId: string;
	runId?: string;
	source: EventSource;
	type: TType;
	payload: TPayload;
	visibility: EventVisibility;
	createdAt: string;
	hash?: string;
	traceId?: string;
};

export type SessionEvent =
	| EventEnvelope<"session.created", { title: string; privacyMode: PrivacyMode }>
	| EventEnvelope<"session.started", { status: RunStatus }>
	| EventEnvelope<"session.paused", { reason?: string }>
	| EventEnvelope<"session.resumed", { reason?: string }>
	| EventEnvelope<"session.completed", { reportId?: string }>
	| EventEnvelope<"session.failed", { error: string }>;

export type MachineEvent =
	| EventEnvelope<"machine.online", { machineId: string; bridgeVersion: string }>
	| EventEnvelope<"machine.offline", { machineId: string; reason?: string }>
	| EventEnvelope<"machine.revoked", { machineId: string; revokedBy: string }>;

export type AgentEvent =
	| EventEnvelope<"agent.detected", { agentKind: AgentKind; command: string; version?: string }>
	| EventEnvelope<"agent.auth_missing", { agentKind: AgentKind; suggestedFix?: string }>
	| EventEnvelope<"agent.started", { agentKind: AgentKind; harnessMode: string }>
	| EventEnvelope<"agent.ended", { agentKind: AgentKind; status: "completed" | "failed" | "cancelled" }>;

export type RunEvent =
	| EventEnvelope<"run.created", { task: string; targetBranch: string }>
	| EventEnvelope<"run.dispatched", { machineId: string; agentInstallationId: string }>
	| EventEnvelope<"run.started", { status: RunStatus; worktreePathHash?: string }>
	| EventEnvelope<"run.waiting_approval", { approvalId: string }>
	| EventEnvelope<"run.paused", { reason?: string }>
	| EventEnvelope<"run.verifying", { verifierCount: number }>
	| EventEnvelope<"run.completed", { reportId?: string; confidence?: number }>
	| EventEnvelope<"run.failed", { error: string; retryable: boolean }>
	| EventEnvelope<"run.cancelled", { reason?: string }>;

export type MessageEvent =
	| EventEnvelope<"message.user", { contentRef?: string; contentInline?: string }>
	| EventEnvelope<"message.assistant_start", { messageId: string; agentKind: AgentKind }>
	| EventEnvelope<"message.assistant_delta", { messageId: string; delta: string }>
	| EventEnvelope<"message.assistant_end", { messageId: string; contentRef?: string }>
	| EventEnvelope<"message.queued", { messageId: string; deliveryPolicy: "after-current-tool" | "after-current-turn" | "after-run-completes" }>
	| EventEnvelope<"message.delivered", { messageId: string }>;

export type TerminalEvent =
	| EventEnvelope<"terminal.open", { cols: number; rows: number }>
	| EventEnvelope<"terminal.stdout", { data: string }>
	| EventEnvelope<"terminal.stderr", { data: string }>
	| EventEnvelope<"terminal.stdin", { data: string; userId: string }>
	| EventEnvelope<"terminal.resize", { cols: number; rows: number }>
	| EventEnvelope<"terminal.lease_requested", { requestedBy: string; mode: TerminalLeaseMode }>
	| EventEnvelope<"terminal.lease_granted", { leaseId: string; holderUserId: string; mode: TerminalLeaseMode }>
	| EventEnvelope<"terminal.lease_released", { leaseId: string }>
	| EventEnvelope<"terminal.closed", { exitCode?: number; signal?: string }>;

export type ToolEvent =
	| EventEnvelope<"tool.start", { toolCallId: string; toolName: string; risk: RiskLevel }>
	| EventEnvelope<"tool.delta", { toolCallId: string; delta: string }>
	| EventEnvelope<"tool.end", { toolCallId: string; status: "success" | "error"; resultRef?: string }>
	| EventEnvelope<"tool.error", { toolCallId: string; error: string }>;

export type ApprovalEvent =
	| EventEnvelope<"approval.requested", { approvalId: string; title: string; risk: RiskLevel }>
	| EventEnvelope<"approval.approved", { approvalId: string; decidedBy: string; status: ApprovalStatus }>
	| EventEnvelope<"approval.rejected", { approvalId: string; decidedBy: string; reason?: string }>
	| EventEnvelope<"approval.expired", { approvalId: string }>;

export type VerifierEvent =
	| EventEnvelope<"verifier.started", { verifierId: string; command: string }>
	| EventEnvelope<"verifier.output", { verifierId: string; outputRef?: string; outputInline?: string }>
	| EventEnvelope<"verifier.completed", { verifierId: string; status: VerificationStatus; durationMs: number }>;

export type ArtifactEvent =
	| EventEnvelope<"artifact.created", { artifactId: string; kind: string; objectKey: string }>
	| EventEnvelope<"artifact.uploaded", { artifactId: string; sizeBytes: number; sha256: string }>
	| EventEnvelope<"artifact.redacted", { artifactId: string; redactionCount: number }>;

export type QueueEvent =
	| EventEnvelope<"queue.item_created", { queueItemId: string; priority: string }>
	| EventEnvelope<"queue.item_started", { queueItemId: string; runId: string }>
	| EventEnvelope<"queue.item_completed", { queueItemId: string; reportId?: string }>
	| EventEnvelope<"queue.item_failed", { queueItemId: string; error: string }>;

export type ScheduleEvent =
	| EventEnvelope<"schedule.triggered", { scheduleId: string; runAfter: string }>
	| EventEnvelope<"schedule.skipped", { scheduleId: string; reason: string }>
	| EventEnvelope<"schedule.completed", { scheduleId: string; runId: string }>;

export type ReportEvent =
	| EventEnvelope<"judge.started", { candidateRunIds: string[] }>
	| EventEnvelope<"judge.scored", { runId: string; score: number }>
	| EventEnvelope<"synthesis.started", { candidateRunIds: string[] }>
	| EventEnvelope<"synthesis.completed", { winningRunId?: string }>
	| EventEnvelope<"report.created", { reportId: string; recommendation: "accept" | "review-carefully" | "reject" | "rerun" }>;

export type OpenFusionEvent =
	| SessionEvent
	| MachineEvent
	| AgentEvent
	| RunEvent
	| MessageEvent
	| TerminalEvent
	| ToolEvent
	| ApprovalEvent
	| VerifierEvent
	| ArtifactEvent
	| QueueEvent
	| ScheduleEvent
	| ReportEvent;

export type OpenFusionEventType = OpenFusionEvent["type"];

export type BrowserControlMessage =
	| { type: "control.pause"; runId: string; reason?: string }
	| { type: "control.resume"; runId: string; reason?: string }
	| { type: "control.cancel"; runId: string; reason?: string }
	| { type: "terminal.stdin"; runId: string; data: string }
	| { type: "terminal.resize"; runId: string; cols: number; rows: number }
	| { type: "terminal.lease.request"; runId: string; mode: TerminalLeaseMode }
	| { type: "terminal.lease.release"; runId: string; leaseId: string }
	| { type: "message.steer"; runId: string; content: string }
	| { type: "message.follow_up"; runId: string; content: string }
	| { type: "approval.decide"; approvalId: string; status: "approved" | "rejected"; notes?: string };

export type BridgeMessage =
	| { type: "machine.heartbeat"; machineId: string; sentAt: string }
	| { type: "agent.detected"; agentKind: AgentKind; command: string; version?: string }
	| { type: "run.status"; runId: string; status: RunStatus }
	| { type: "event.batch"; events: OpenFusionEvent[] };
