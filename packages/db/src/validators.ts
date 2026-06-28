import { z } from "zod";

import type {
	CreateApprovalInput,
	CreateArtifactInput,
	CreateDecisionReportInput,
	CreateQueueItemInput,
	CreateRunInput,
	CreateSessionInput,
	CreateWorkspaceInput,
	DecideApprovalInput,
	JsonRecord,
	JsonValue,
	PersistEventInput,
	UpdateRunStatusInput,
	UpsertAgentInstallationInput,
	UpsertMachineInput,
	UpsertPolicyRuleInput,
	UpsertScheduledJobInput,
} from "./types/openfusion-db";
import type { OpenFusionEventType } from "@openfusion/core";

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

export const openFusionEventTypes = [
	"session.created",
	"session.started",
	"session.paused",
	"session.resumed",
	"session.completed",
	"session.failed",
	"machine.online",
	"machine.offline",
	"machine.revoked",
	"agent.detected",
	"agent.auth_missing",
	"agent.started",
	"agent.ended",
	"run.created",
	"run.dispatched",
	"run.started",
	"run.waiting_approval",
	"run.paused",
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
] as const satisfies readonly [OpenFusionEventType, ...OpenFusionEventType[]];

export const openFusionEventTypeSchema = z.enum(openFusionEventTypes);

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
);

export const jsonRecordSchema: z.ZodType<JsonRecord> = z.record(z.string(), jsonValueSchema);

export const openFusionEventSchema = z
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
		type: openFusionEventTypeSchema,
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
		event: openFusionEventSchema,
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
		status: runStatusSchema.optional(),
		task: nonBlankStringSchema,
		updatedAt: optionalTimestampSchema,
		workspaceId: nonBlankStringSchema,
	})
	.strict() satisfies z.ZodType<CreateQueueItemInput>;

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
