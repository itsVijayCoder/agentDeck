import type {
	AgentCapability,
	AgentKind,
	ApprovalStatus,
	MetricName,
	PrivacyMode,
	QueuePriority,
	RiskLevel,
	RunStatus,
} from "@agentdeck/core";
import type { EventSource, EventVisibility, AgentDeckEvent } from "@agentdeck/core";

export type IsoTimestamp = string;
export type R2ObjectKey = string;
export type SqliteBoolean = 0 | 1;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonRecord = { [key: string]: JsonValue };

export type MachineStatus = "online" | "offline" | "pairing" | "stale" | "revoked";
export type AgentAuthStatus = "unknown" | "configured" | "missing" | "expired";
export type ApprovalKind = "command" | "provider" | "file" | "queue" | "patch";
export type ScheduleLastStatus = "success" | "failed" | "cancelled" | "never-run";
export type ArtifactRedactionStatus = "none" | "pending" | "redacted" | "blocked";
export type ReportRecommendation = "accept" | "review-carefully" | "reject" | "rerun";
export type PolicyDecision = "allow" | "approval" | "deny";
export type WorkspaceMemberRole = "owner" | "member" | "observer";
export type AuditAction =
	| "approval.decided"
	| "terminal.jump_in"
	| "terminal.release"
	| "terminal.human_input"
	| "session.created"
	| "session.started"
	| "session.paused"
	| "session.resumed"
	| "session.cancelled"
	| "queue.item_created"
	| "queue.item_cancelled"
	| "schedule.created"
	| "schedule.updated"
	| "schedule.run_now"
	| "policy.updated"
	| "machine.paired"
	| "machine.revoked"
	| "member.invited"
	| "member.removed"
	| "patch.applied"
	| "patch.exported"
	| "eval.started"
	| "retention.updated";
export type EvalRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type RetentionResourceType =
	| "terminal-logs"
	| "transcripts"
	| "events"
	| "artifacts"
	| "reports"
	| "audit-log"
	| "metric-snapshots"
	| "eval-runs";
export type RetentionAction = "archive" | "delete";

export type WorkspaceRow = {
	id: string;
	name: string;
	repository_url: string | null;
	default_branch: string;
	privacy_mode: PrivacyMode;
	created_at: IsoTimestamp;
	updated_at: IsoTimestamp;
};

export type UserRow = {
	avatar_url: string | null;
	created_at: IsoTimestamp;
	display_name: string | null;
	email: string;
	id: string;
	updated_at: IsoTimestamp;
};

export type WorkspaceMemberRow = {
	created_at: IsoTimestamp;
	id: string;
	invited_at: IsoTimestamp;
	invited_by: string | null;
	joined_at: IsoTimestamp | null;
	role: WorkspaceMemberRole;
	user_id: string;
	workspace_id: string;
};

export type MachineRow = {
	id: string;
	workspace_id: string;
	display_name: string;
	os: string;
	arch: string;
	bridge_version: string;
	status: MachineStatus;
	last_seen_at: IsoTimestamp | null;
	revoked_at: IsoTimestamp | null;
	created_at: IsoTimestamp;
	updated_at: IsoTimestamp;
};

export type AgentInstallationRow = {
	id: string;
	machine_id: string;
	agent_kind: AgentKind;
	command: string;
	version: string | null;
	auth_status: AgentAuthStatus;
	capabilities_json: string;
	detected_at: IsoTimestamp;
	updated_at: IsoTimestamp;
};

export type SessionRow = {
	id: string;
	workspace_id: string;
	parent_session_id: string | null;
	title: string;
	status: RunStatus;
	privacy_mode: PrivacyMode;
	created_by: string;
	created_at: IsoTimestamp;
	updated_at: IsoTimestamp;
};

export type RunRow = {
	id: string;
	session_id: string;
	queue_item_id: string | null;
	scheduled_job_id: string | null;
	machine_id: string | null;
	agent_installation_id: string | null;
	task: string;
	worktree_path_hash: string | null;
	branch_name: string | null;
	status: RunStatus;
	cost_usd: number | null;
	latency_ms: number | null;
	confidence: number | null;
	started_at: IsoTimestamp | null;
	completed_at: IsoTimestamp | null;
	created_at: IsoTimestamp;
	updated_at: IsoTimestamp;
};

export type EventIndexRow = {
	id: string;
	workspace_id: string;
	session_id: string;
	run_id: string | null;
	seq: number;
	type: AgentDeckEvent["type"];
	source: EventSource;
	visibility: EventVisibility;
	object_key: R2ObjectKey | null;
	payload_hash: string | null;
	trace_id: string | null;
	created_at: IsoTimestamp;
};

export type ApprovalRow = {
	id: string;
	workspace_id: string;
	session_id: string;
	run_id: string;
	kind: ApprovalKind;
	title: string;
	risk: RiskLevel;
	status: ApprovalStatus;
	requested_action_json: string;
	decision_json: string | null;
	decided_by: string | null;
	expires_at: IsoTimestamp | null;
	created_at: IsoTimestamp;
	decided_at: IsoTimestamp | null;
};

export type QueueItemRow = {
	id: string;
	workspace_id: string;
	created_by: string;
	task: string;
	priority: QueuePriority;
	status: RunStatus;
	run_after: IsoTimestamp | null;
	schedule_window_json: string | null;
	agent_selector_json: string | null;
	machine_selector_json: string | null;
	max_cost_usd: number | null;
	max_runtime_minutes: number | null;
	created_at: IsoTimestamp;
	updated_at: IsoTimestamp;
	cancelled_at: IsoTimestamp | null;
};

export type ScheduledJobRow = {
	id: string;
	workspace_id: string;
	name: string;
	natural_language: string;
	cron: string;
	timezone: string;
	enabled: SqliteBoolean;
	task_template: string;
	agent_selector_json: string;
	machine_selector_json: string;
	next_run_at: IsoTimestamp | null;
	last_run_at: IsoTimestamp | null;
	last_status: ScheduleLastStatus | null;
	created_at: IsoTimestamp;
	updated_at: IsoTimestamp;
};

export type ArtifactRow = {
	id: string;
	workspace_id: string;
	session_id: string;
	run_id: string | null;
	kind: string;
	object_key: R2ObjectKey;
	mime_type: string;
	size_bytes: number;
	sha256: string;
	redaction_status: ArtifactRedactionStatus;
	created_at: IsoTimestamp;
};

export type DecisionReportRow = {
	id: string;
	workspace_id: string;
	session_id: string;
	summary: string;
	recommendation: ReportRecommendation;
	confidence: number;
	cost_usd: number | null;
	latency_ms: number | null;
	report_json: string;
	object_key: R2ObjectKey | null;
	created_at: IsoTimestamp;
};

export type PolicyRuleRow = {
	id: string;
	workspace_id: string;
	action: string;
	default_decision: PolicyDecision;
	risk: RiskLevel;
	reason: string;
	matcher_json: string;
	enabled: SqliteBoolean;
	created_at: IsoTimestamp;
	updated_at: IsoTimestamp;
};

export type AuditLogRow = {
	action: AuditAction;
	actor_id: string | null;
	created_at: IsoTimestamp;
	details_json: string | null;
	id: string;
	ip_address: string | null;
	resource_id: string | null;
	resource_type: string;
	user_agent: string | null;
	workspace_id: string;
};

export type MetricSnapshotRow = {
	created_at: IsoTimestamp;
	id: string;
	labels_json: string;
	metric_name: MetricName;
	metric_value: number;
	period_end: IsoTimestamp;
	period_start: IsoTimestamp;
	workspace_id: string;
};

export type EvalRunRow = {
	agent_kind: AgentKind;
	completed_at: IsoTimestamp | null;
	created_at: IsoTimestamp;
	dataset_id: string;
	id: string;
	model: string | null;
	results_json: string | null;
	score: number | null;
	started_at: IsoTimestamp;
	status: EvalRunStatus;
	workspace_id: string;
};

export type RetentionPolicyRow = {
	action: RetentionAction;
	created_at: IsoTimestamp;
	id: string;
	resource_type: RetentionResourceType;
	retention_days: number;
	updated_at: IsoTimestamp;
	workspace_id: string;
};

export type CreateWorkspaceInput = {
	id: string;
	name: string;
	repositoryUrl?: string | null;
	defaultBranch?: string;
	privacyMode: PrivacyMode;
	createdAt?: IsoTimestamp;
	updatedAt?: IsoTimestamp;
};

export type UpsertUserInput = {
	avatarUrl?: string | null;
	createdAt?: IsoTimestamp;
	displayName?: string | null;
	email: string;
	id: string;
	updatedAt?: IsoTimestamp;
};

export type UpsertWorkspaceMemberInput = {
	createdAt?: IsoTimestamp;
	id: string;
	invitedAt?: IsoTimestamp;
	invitedBy?: string | null;
	joinedAt?: IsoTimestamp | null;
	role: WorkspaceMemberRole;
	userId: string;
	workspaceId: string;
};

export type UpsertMachineInput = {
	id: string;
	workspaceId: string;
	displayName: string;
	os: string;
	arch: string;
	bridgeVersion: string;
	status: MachineStatus;
	lastSeenAt?: IsoTimestamp | null;
	revokedAt?: IsoTimestamp | null;
	createdAt?: IsoTimestamp;
	updatedAt?: IsoTimestamp;
};

export type UpsertAgentInstallationInput = {
	id: string;
	machineId: string;
	agentKind: AgentKind;
	command: string;
	version?: string | null;
	authStatus: AgentAuthStatus;
	capabilities: AgentCapability[];
	detectedAt?: IsoTimestamp;
	updatedAt?: IsoTimestamp;
};

export type CreateSessionInput = {
	id: string;
	workspaceId: string;
	parentSessionId?: string | null;
	title: string;
	status?: RunStatus;
	privacyMode: PrivacyMode;
	createdBy: string;
	createdAt?: IsoTimestamp;
	updatedAt?: IsoTimestamp;
};

export type CreateRunInput = {
	id: string;
	sessionId: string;
	queueItemId?: string | null;
	scheduledJobId?: string | null;
	machineId?: string | null;
	agentInstallationId?: string | null;
	task: string;
	worktreePathHash?: string | null;
	branchName?: string | null;
	status?: RunStatus;
	costUsd?: number | null;
	latencyMs?: number | null;
	confidence?: number | null;
	startedAt?: IsoTimestamp | null;
	completedAt?: IsoTimestamp | null;
	createdAt?: IsoTimestamp;
	updatedAt?: IsoTimestamp;
};

export type UpdateRunStatusInput = {
	id: string;
	status: RunStatus;
	costUsd?: number | null;
	latencyMs?: number | null;
	confidence?: number | null;
	startedAt?: IsoTimestamp | null;
	completedAt?: IsoTimestamp | null;
	updatedAt?: IsoTimestamp;
};

export type PersistEventInput = {
	event: AgentDeckEvent;
	objectKey?: R2ObjectKey | null;
};

export type CreateApprovalInput = {
	id: string;
	workspaceId: string;
	sessionId: string;
	runId: string;
	kind: ApprovalKind;
	title: string;
	risk: RiskLevel;
	status?: ApprovalStatus;
	requestedAction: JsonValue;
	decision?: JsonValue | null;
	decidedBy?: string | null;
	expiresAt?: IsoTimestamp | null;
	createdAt?: IsoTimestamp;
	decidedAt?: IsoTimestamp | null;
};

export type DecideApprovalInput = {
	id: string;
	status: ApprovalStatus;
	decision?: JsonValue | null;
	decidedBy?: string | null;
	decidedAt?: IsoTimestamp;
};

export type CreateQueueItemInput = {
	id: string;
	workspaceId: string;
	createdBy: string;
	task: string;
	priority: QueuePriority;
	status?: RunStatus;
	runAfter?: IsoTimestamp | null;
	scheduleWindow?: JsonValue | null;
	agentSelector?: JsonValue | null;
	machineSelector?: JsonValue | null;
	maxCostUsd?: number | null;
	maxRuntimeMinutes?: number | null;
	createdAt?: IsoTimestamp;
	updatedAt?: IsoTimestamp;
};

export type UpdateQueueItemInput = {
	id: string;
	priority?: QueuePriority;
	status?: RunStatus;
	runAfter?: IsoTimestamp | null;
	scheduleWindow?: JsonValue | null;
	agentSelector?: JsonValue | null;
	machineSelector?: JsonValue | null;
	maxCostUsd?: number | null;
	maxRuntimeMinutes?: number | null;
	cancelledAt?: IsoTimestamp | null;
	updatedAt?: IsoTimestamp;
};

export type UpsertScheduledJobInput = {
	id: string;
	workspaceId: string;
	name: string;
	naturalLanguage: string;
	cron: string;
	timezone: string;
	enabled: boolean;
	taskTemplate: string;
	agentSelector: JsonValue;
	machineSelector: JsonValue;
	nextRunAt?: IsoTimestamp | null;
	lastRunAt?: IsoTimestamp | null;
	lastStatus?: ScheduleLastStatus | null;
	createdAt?: IsoTimestamp;
	updatedAt?: IsoTimestamp;
};

export type CreateArtifactInput = {
	id: string;
	workspaceId: string;
	sessionId: string;
	runId?: string | null;
	kind: string;
	objectKey: R2ObjectKey;
	mimeType: string;
	sizeBytes: number;
	sha256: string;
	redactionStatus: ArtifactRedactionStatus;
	createdAt?: IsoTimestamp;
};

export type CreateDecisionReportInput = {
	id: string;
	workspaceId: string;
	sessionId: string;
	summary: string;
	recommendation: ReportRecommendation;
	confidence: number;
	costUsd?: number | null;
	latencyMs?: number | null;
	report: JsonValue;
	objectKey?: R2ObjectKey | null;
	createdAt?: IsoTimestamp;
};

export type UpsertPolicyRuleInput = {
	id: string;
	workspaceId: string;
	action: string;
	defaultDecision: PolicyDecision;
	risk: RiskLevel;
	reason: string;
	matcher: JsonRecord;
	enabled: boolean;
	createdAt?: IsoTimestamp;
	updatedAt?: IsoTimestamp;
};

export type CreateAuditLogInput = {
	action: AuditAction;
	actorId?: string | null;
	createdAt?: IsoTimestamp;
	details?: JsonValue | null;
	id?: string;
	ipAddress?: string | null;
	resourceId?: string | null;
	resourceType: string;
	userAgent?: string | null;
	workspaceId: string;
};

export type CreateMetricSnapshotInput = {
	createdAt?: IsoTimestamp;
	id?: string;
	labels?: JsonRecord;
	metricName: MetricName;
	metricValue: number;
	periodEnd: IsoTimestamp;
	periodStart: IsoTimestamp;
	workspaceId: string;
};

export type CreateEvalRunInput = {
	agentKind: AgentKind;
	completedAt?: IsoTimestamp | null;
	createdAt?: IsoTimestamp;
	datasetId: string;
	id?: string;
	model?: string | null;
	results?: JsonValue | null;
	score?: number | null;
	startedAt?: IsoTimestamp;
	status?: EvalRunStatus;
	workspaceId: string;
};

export type UpdateEvalRunInput = {
	completedAt?: IsoTimestamp | null;
	id: string;
	results?: JsonValue | null;
	score?: number | null;
	status?: EvalRunStatus;
};

export type UpsertRetentionPolicyInput = {
	action: RetentionAction;
	createdAt?: IsoTimestamp;
	id: string;
	resourceType: RetentionResourceType;
	retentionDays: number;
	updatedAt?: IsoTimestamp;
	workspaceId: string;
};
