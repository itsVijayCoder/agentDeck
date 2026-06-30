import { z } from "zod";

import type {
	CreateAuditLogInput,
	CreateApprovalInput,
	CreateArtifactInput,
	CreateDecisionReportInput,
	CreateEvalRunInput,
	CreateMetricSnapshotInput,
	CreateQueueItemInput,
	CreateRunInput,
	CreateSessionInput,
	CreateWorkspaceInput,
	DecideApprovalInput,
	JsonRecord,
	JsonValue,
	PersistEventInput,
	UpdateQueueItemInput,
	UpdateEvalRunInput,
	UpdateRunStatusInput,
	UpsertRetentionPolicyInput,
	UpsertAgentInstallationInput,
	UpsertMachineInput,
	UpsertPolicyRuleInput,
	UpsertScheduledJobInput,
	UpsertUserInput,
	UpsertWorkspaceMemberInput,
} from "./types/agentdeck-db";
import type { AgentDeckEventType } from "@agentdeck/core";

const nonBlankStringSchema = z.string().refine((value) => value.trim().length > 0, {
	message: "Expected a non-blank string",
});
const optionalNullableNonBlankStringSchema = nonBlankStringSchema.nullable().optional();
const isoTimestampSchema = z.iso.datetime();
const optionalTimestampSchema = isoTimestampSchema.optional();
const optionalNullableTimestampSchema = isoTimestampSchema.nullable().optional();
const nonNegativeFiniteNumberSchema = z.number().finite().nonnegative();
const positiveIntegerSchema = z.number().int().positive();

export const privacyModeSchema = z.enum(["local-only", "metadata-only", "full-sync"]);
export const runStatusSchema = z.enum([
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
]);
export const riskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export const agentKindSchema = z.enum(["claude-code", "codex", "opencode", "qwen-code", "pi", "aider", "acp"]);
export const agentCapabilitySchema = z.enum([
	"terminal",
	"repo-aware",
	"code-edit",
	"bash",
	"mcp",
	"acp",
	"json-events",
	"rpc",
	"sdk",
	"model-switching",
	"session-branching",
	"message-queue",
	"custom-tools",
]);
export const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "expired"]);
export const queuePrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const machineStatusSchema = z.enum(["online", "offline", "pairing", "stale", "revoked"]);
export const agentAuthStatusSchema = z.enum(["unknown", "configured", "missing", "expired"]);
export const approvalKindSchema = z.enum(["command", "provider", "file", "queue", "patch"]);
export const scheduleLastStatusSchema = z.enum(["success", "failed", "cancelled", "never-run"]);
export const artifactRedactionStatusSchema = z.enum(["none", "pending", "redacted", "blocked"]);
export const reportRecommendationSchema = z.enum(["accept", "review-carefully", "reject", "rerun"]);
export const policyDecisionSchema = z.enum(["allow", "approval", "deny"]);
export const workspaceMemberRoleSchema = z.enum(["owner", "member", "observer"]);
export const auditActionSchema = z.enum([
	"approval.decided",
	"terminal.jump_in",
	"terminal.release",
	"terminal.human_input",
	"session.created",
	"session.started",
	"session.paused",
	"session.resumed",
	"session.cancelled",
	"queue.item_created",
	"queue.item_dispatched",
	"queue.item_cancelled",
	"schedule.created",
	"schedule.updated",
	"schedule.run_now",
	"policy.updated",
	"machine.paired",
	"machine.revoked",
	"member.invited",
	"member.removed",
	"patch.applied",
	"patch.exported",
	"eval.started",
	"retention.updated",
]);
export const metricNameSchema = z.enum([
	"run_count",
	"run_success_count",
	"run_failure_count",
	"run_success_rate",
	"approval_count",
	"approval_rejection_rate",
	"agent_usage_by_kind",
	"provider_usage_by_model",
	"cost_usd_by_workspace",
	"latency_p50_ms",
	"latency_p95_ms",
	"queue_wait_time_ms",
	"queue_completion_rate",
	"scheduled_job_success_rate",
	"verifier_pass_rate",
	"secret_redaction_count",
	"policy_block_count",
	"jump_in_count",
	"human_intervention_count",
]);
export const evalRunStatusSchema = z.enum(["queued", "running", "completed", "failed", "cancelled"]);
export const retentionResourceTypeSchema = z.enum([
	"terminal-logs",
	"transcripts",
	"events",
	"artifacts",
	"reports",
	"audit-log",
	"metric-snapshots",
	"eval-runs",
]);
export const retentionActionSchema = z.enum(["archive", "delete"]);
export const eventSourceSchema = z.enum([
	"browser",
	"worker",
	"durable-object",
	"bridge",
	"agent",
	"verifier",
	"ai-gateway",
]);
export const eventVisibilitySchema = z.enum(["local-only", "metadata", "full"]);

export const agentDeckEventTypes = [
	"session.created",
	"session.started",
	"session.paused",
	"session.resumed",
	"session.completed",
	"session.failed",
	"machine.online",
	"machine.heartbeat",
	"machine.offline",
	"machine.revoked",
	"agent.detected",
	"agent.auth_missing",
	"agent.started",
	"agent.ended",
	"run.created",
	"run.dispatched",
	"run.started",
	"run.status",
	"run.waiting_approval",
	"run.paused",
	"run.resumed",
	"run.verifying",
	"run.completed",
	"run.failed",
	"run.cancelled",
	"message.user",
	"message.assistant_start",
	"message.assistant_delta",
	"message.assistant_end",
	"message.queued",
	"message.delivered",
	"terminal.open",
	"terminal.stdout",
	"terminal.stderr",
	"terminal.stdin",
	"terminal.resize",
	"terminal.lease_requested",
	"terminal.lease_granted",
	"terminal.lease_released",
	"terminal.closed",
	"tool.start",
	"tool.delta",
	"tool.end",
	"tool.error",
	"approval.requested",
	"approval.approved",
	"approval.rejected",
	"approval.expired",
	"verifier.started",
	"verifier.output",
	"verifier.completed",
	"artifact.created",
	"artifact.uploaded",
	"artifact.redacted",
	"queue.item_created",
	"queue.item_started",
	"queue.item_completed",
	"queue.item_failed",
	"schedule.triggered",
	"schedule.skipped",
	"schedule.completed",
	"judge.started",
	"judge.scored",
	"synthesis.started",
	"synthesis.completed",
	"report.created",
] as const satisfies readonly [AgentDeckEventType, ...AgentDeckEventType[]];

export const agentDeckEventTypeSchema = z.enum(agentDeckEventTypes);

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

export const jsonRecordSchema: z.ZodType<JsonRecord> = z.record(z.string(), jsonValueSchema);

export const agentDeckEventSchema = z
	.object({
		createdAt: nonBlankStringSchema,
		hash: nonBlankStringSchema.optional(),
		id: nonBlankStringSchema,
		payload: jsonValueSchema,
		runId: nonBlankStringSchema.optional(),
		seq: z.number().int().nonnegative(),
		sessionId: nonBlankStringSchema,
		source: eventSourceSchema,
		traceId: nonBlankStringSchema.optional(),
		type: agentDeckEventTypeSchema,
		visibility: eventVisibilitySchema,
		workspaceId: nonBlankStringSchema,
	})
	.strict();

export const createWorkspaceInputSchema = z
	.object({
		createdAt: optionalTimestampSchema,
		defaultBranch: nonBlankStringSchema.optional(),
		id: nonBlankStringSchema,
		name: nonBlankStringSchema,
		privacyMode: privacyModeSchema,
		repositoryUrl: optionalNullableNonBlankStringSchema,
		updatedAt: optionalTimestampSchema,
	})
	.strict() satisfies z.ZodType<CreateWorkspaceInput>;

export const upsertUserInputSchema = z
	.object({
		avatarUrl: optionalNullableNonBlankStringSchema,
		createdAt: optionalTimestampSchema,
		displayName: optionalNullableNonBlankStringSchema,
		email: z.email(),
		id: nonBlankStringSchema,
		updatedAt: optionalTimestampSchema,
	})
	.strict() satisfies z.ZodType<UpsertUserInput>;

export const upsertWorkspaceMemberInputSchema = z
	.object({
		createdAt: optionalTimestampSchema,
		id: nonBlankStringSchema,
		invitedAt: optionalTimestampSchema,
		invitedBy: optionalNullableNonBlankStringSchema,
		joinedAt: optionalNullableTimestampSchema,
		role: workspaceMemberRoleSchema,
		userId: nonBlankStringSchema,
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<UpsertWorkspaceMemberInput>;

export const upsertMachineInputSchema = z
	.object({
		arch: nonBlankStringSchema,
		bridgeVersion: nonBlankStringSchema,
		createdAt: optionalTimestampSchema,
		displayName: nonBlankStringSchema,
		id: nonBlankStringSchema,
		lastSeenAt: optionalNullableTimestampSchema,
		os: nonBlankStringSchema,
		revokedAt: optionalNullableTimestampSchema,
		status: machineStatusSchema,
		updatedAt: optionalTimestampSchema,
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<UpsertMachineInput>;

export const upsertAgentInstallationInputSchema = z
	.object({
		agentKind: agentKindSchema,
		authStatus: agentAuthStatusSchema,
		capabilities: z.array(agentCapabilitySchema),
		command: nonBlankStringSchema,
		detectedAt: optionalTimestampSchema,
		id: nonBlankStringSchema,
		machineId: nonBlankStringSchema,
		updatedAt: optionalTimestampSchema,
		version: optionalNullableNonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<UpsertAgentInstallationInput>;

export const createSessionInputSchema = z
	.object({
		createdAt: optionalTimestampSchema,
		createdBy: nonBlankStringSchema,
		id: nonBlankStringSchema,
		parentSessionId: optionalNullableNonBlankStringSchema,
		privacyMode: privacyModeSchema,
		status: runStatusSchema.optional(),
		title: nonBlankStringSchema.max(500),
		updatedAt: optionalTimestampSchema,
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<CreateSessionInput>;

export const createRunInputSchema = z
	.object({
		agentInstallationId: optionalNullableNonBlankStringSchema,
		branchName: optionalNullableNonBlankStringSchema,
		completedAt: optionalNullableTimestampSchema,
		confidence: nonNegativeFiniteNumberSchema.max(1).nullable().optional(),
		costUsd: nonNegativeFiniteNumberSchema.nullable().optional(),
		createdAt: optionalTimestampSchema,
		id: nonBlankStringSchema,
		latencyMs: z.number().int().nonnegative().nullable().optional(),
		machineId: optionalNullableNonBlankStringSchema,
		queueItemId: optionalNullableNonBlankStringSchema,
		scheduledJobId: optionalNullableNonBlankStringSchema,
		sessionId: nonBlankStringSchema,
		startedAt: optionalNullableTimestampSchema,
		status: runStatusSchema.optional(),
		task: nonBlankStringSchema,
		updatedAt: optionalTimestampSchema,
		worktreePathHash: optionalNullableNonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<CreateRunInput>;

export const updateRunStatusInputSchema = z
	.object({
		completedAt: optionalNullableTimestampSchema,
		confidence: nonNegativeFiniteNumberSchema.max(1).nullable().optional(),
		costUsd: nonNegativeFiniteNumberSchema.nullable().optional(),
		id: nonBlankStringSchema,
		latencyMs: z.number().int().nonnegative().nullable().optional(),
		startedAt: optionalNullableTimestampSchema,
		status: runStatusSchema,
		updatedAt: optionalTimestampSchema,
	})
	.strict() satisfies z.ZodType<UpdateRunStatusInput>;

export const persistEventInputSchema = z
	.object({
		event: agentDeckEventSchema,
		objectKey: optionalNullableNonBlankStringSchema,
	})
	.strict();

export function parsePersistEventInput(input: PersistEventInput): PersistEventInput {
	return persistEventInputSchema.parse(input) as PersistEventInput;
}

export const createApprovalInputSchema = z
	.object({
		createdAt: optionalTimestampSchema,
		decidedAt: optionalNullableTimestampSchema,
		decidedBy: optionalNullableNonBlankStringSchema,
		decision: jsonValueSchema.nullable().optional(),
		expiresAt: optionalNullableTimestampSchema,
		id: nonBlankStringSchema,
		kind: approvalKindSchema,
		requestedAction: jsonValueSchema,
		risk: riskLevelSchema,
		runId: nonBlankStringSchema,
		sessionId: nonBlankStringSchema,
		status: approvalStatusSchema.optional(),
		title: nonBlankStringSchema,
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<CreateApprovalInput>;

export const decideApprovalInputSchema = z
	.object({
		decidedAt: optionalTimestampSchema,
		decidedBy: optionalNullableNonBlankStringSchema,
		decision: jsonValueSchema.nullable().optional(),
		id: nonBlankStringSchema,
		status: approvalStatusSchema,
	})
	.strict() satisfies z.ZodType<DecideApprovalInput>;

export const createQueueItemInputSchema = z
	.object({
		agentSelector: jsonValueSchema.nullable().optional(),
		createdAt: optionalTimestampSchema,
		createdBy: nonBlankStringSchema,
		id: nonBlankStringSchema,
		machineSelector: jsonValueSchema.nullable().optional(),
		maxCostUsd: nonNegativeFiniteNumberSchema.nullable().optional(),
		maxRuntimeMinutes: positiveIntegerSchema.nullable().optional(),
		priority: queuePrioritySchema,
		runAfter: optionalNullableTimestampSchema,
		scheduleWindow: jsonValueSchema.nullable().optional(),
		sessionId: optionalNullableNonBlankStringSchema,
		status: runStatusSchema.optional(),
		task: nonBlankStringSchema,
		updatedAt: optionalTimestampSchema,
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<CreateQueueItemInput>;

export const updateQueueItemInputSchema = z
	.object({
		agentSelector: jsonValueSchema.nullable().optional(),
		cancelledAt: optionalNullableTimestampSchema,
		id: nonBlankStringSchema,
		machineSelector: jsonValueSchema.nullable().optional(),
		maxCostUsd: nonNegativeFiniteNumberSchema.nullable().optional(),
		maxRuntimeMinutes: positiveIntegerSchema.nullable().optional(),
		priority: queuePrioritySchema.optional(),
		runAfter: optionalNullableTimestampSchema,
		scheduleWindow: jsonValueSchema.nullable().optional(),
		sessionId: optionalNullableNonBlankStringSchema,
		status: runStatusSchema.optional(),
		updatedAt: optionalTimestampSchema,
	})
	.strict() satisfies z.ZodType<UpdateQueueItemInput>;

export const upsertScheduledJobInputSchema = z
	.object({
		agentSelector: jsonValueSchema,
		createdAt: optionalTimestampSchema,
		cron: nonBlankStringSchema,
		enabled: z.boolean(),
		id: nonBlankStringSchema,
		lastRunAt: optionalNullableTimestampSchema,
		lastStatus: scheduleLastStatusSchema.nullable().optional(),
		machineSelector: jsonValueSchema,
		name: nonBlankStringSchema,
		naturalLanguage: nonBlankStringSchema,
		nextRunAt: optionalNullableTimestampSchema,
		taskTemplate: nonBlankStringSchema,
		timezone: nonBlankStringSchema,
		updatedAt: optionalTimestampSchema,
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<UpsertScheduledJobInput>;

export const createArtifactInputSchema = z
	.object({
		createdAt: optionalTimestampSchema,
		id: nonBlankStringSchema,
		kind: nonBlankStringSchema,
		mimeType: nonBlankStringSchema,
		objectKey: nonBlankStringSchema,
		redactionStatus: artifactRedactionStatusSchema,
		runId: optionalNullableNonBlankStringSchema,
		sessionId: nonBlankStringSchema,
		sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
		sizeBytes: z.number().int().nonnegative(),
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<CreateArtifactInput>;

export const createDecisionReportInputSchema = z
	.object({
		confidence: nonNegativeFiniteNumberSchema.max(1),
		costUsd: nonNegativeFiniteNumberSchema.nullable().optional(),
		createdAt: optionalTimestampSchema,
		id: nonBlankStringSchema,
		latencyMs: z.number().int().nonnegative().nullable().optional(),
		objectKey: optionalNullableNonBlankStringSchema,
		recommendation: reportRecommendationSchema,
		report: jsonValueSchema,
		sessionId: nonBlankStringSchema,
		summary: nonBlankStringSchema,
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<CreateDecisionReportInput>;

export const upsertPolicyRuleInputSchema = z
	.object({
		action: nonBlankStringSchema,
		createdAt: optionalTimestampSchema,
		defaultDecision: policyDecisionSchema,
		enabled: z.boolean(),
		id: nonBlankStringSchema,
		matcher: jsonRecordSchema,
		reason: nonBlankStringSchema,
		risk: riskLevelSchema,
		updatedAt: optionalTimestampSchema,
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<UpsertPolicyRuleInput>;

export const createAuditLogInputSchema = z
	.object({
		action: auditActionSchema,
		actorId: optionalNullableNonBlankStringSchema,
		createdAt: optionalTimestampSchema,
		details: jsonValueSchema.nullable().optional(),
		id: nonBlankStringSchema.optional(),
		ipAddress: optionalNullableNonBlankStringSchema,
		resourceId: optionalNullableNonBlankStringSchema,
		resourceType: nonBlankStringSchema,
		userAgent: optionalNullableNonBlankStringSchema,
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<CreateAuditLogInput>;

export const createMetricSnapshotInputSchema = z
	.object({
		createdAt: optionalTimestampSchema,
		id: nonBlankStringSchema.optional(),
		labels: jsonRecordSchema.optional(),
		metricName: metricNameSchema,
		metricValue: z.number().finite(),
		periodEnd: isoTimestampSchema,
		periodStart: isoTimestampSchema,
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<CreateMetricSnapshotInput>;

export const createEvalRunInputSchema = z
	.object({
		agentKind: agentKindSchema,
		completedAt: optionalNullableTimestampSchema,
		createdAt: optionalTimestampSchema,
		datasetId: nonBlankStringSchema,
		id: nonBlankStringSchema.optional(),
		model: optionalNullableNonBlankStringSchema,
		results: jsonValueSchema.nullable().optional(),
		score: nonNegativeFiniteNumberSchema.max(1).nullable().optional(),
		startedAt: optionalTimestampSchema,
		status: evalRunStatusSchema.optional(),
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<CreateEvalRunInput>;

export const updateEvalRunInputSchema = z
	.object({
		completedAt: optionalNullableTimestampSchema,
		id: nonBlankStringSchema,
		results: jsonValueSchema.nullable().optional(),
		score: nonNegativeFiniteNumberSchema.max(1).nullable().optional(),
		status: evalRunStatusSchema.optional(),
	})
	.strict() satisfies z.ZodType<UpdateEvalRunInput>;

export const upsertRetentionPolicyInputSchema = z
	.object({
		action: retentionActionSchema,
		createdAt: optionalTimestampSchema,
		id: nonBlankStringSchema,
		resourceType: retentionResourceTypeSchema,
		retentionDays: positiveIntegerSchema.max(3650),
		updatedAt: optionalTimestampSchema,
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<UpsertRetentionPolicyInput>;
