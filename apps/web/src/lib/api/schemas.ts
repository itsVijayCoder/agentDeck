import {
	agentAuthStatusSchema,
	agentCapabilitySchema,
	agentKindSchema,
	jsonRecordSchema,
	jsonValueSchema,
	machineStatusSchema,
	policyDecisionSchema,
	privacyModeSchema,
	queuePrioritySchema,
	retentionActionSchema,
	retentionResourceTypeSchema,
	riskLevelSchema,
	runStatusSchema,
	workspaceMemberRoleSchema,
} from "@agentdeck/db";
import { z } from "zod";

const nonBlankStringSchema = z.string().trim().min(1);
const optionalNullableNonBlankStringSchema = nonBlankStringSchema.nullable().optional();
const optionalNullableIsoTimestampSchema = z.iso.datetime().nullable().optional();
const optionalNonNegativeNumberSchema = z.number().finite().nonnegative().nullable().optional();
const optionalPositiveIntegerSchema = z.number().int().positive().nullable().optional();

export const createWorkspaceRequestSchema = z
	.object({
		defaultBranch: nonBlankStringSchema.optional(),
		name: nonBlankStringSchema,
		privacyMode: privacyModeSchema.default("metadata-only"),
		repositoryUrl: optionalNullableNonBlankStringSchema,
	})
	.strict();

export const createSessionRequestSchema = z
	.object({
		parentSessionId: optionalNullableNonBlankStringSchema,
		privacyMode: privacyModeSchema.optional(),
		title: nonBlankStringSchema.max(500),
	})
	.strict();

export const sessionActionRequestSchema = z
	.object({
		reason: nonBlankStringSchema.optional(),
	})
	.strict();

export const completePairingRequestSchema = z
	.object({
		agents: z
			.array(
				z
					.object({
						authStatus: agentAuthStatusSchema.default("unknown"),
						capabilities: z.array(agentCapabilitySchema).default([]),
						command: nonBlankStringSchema,
						id: nonBlankStringSchema.optional(),
						kind: agentKindSchema,
						version: optionalNullableNonBlankStringSchema,
					})
					.strict(),
			)
			.default([]),
		arch: nonBlankStringSchema,
		bridgeVersion: nonBlankStringSchema,
		displayName: nonBlankStringSchema,
		machineId: nonBlankStringSchema.optional(),
		os: nonBlankStringSchema,
		pairingCode: nonBlankStringSchema,
	})
	.strict();

export const approvalDecisionRequestSchema = z
	.object({
		decision: jsonValueSchema.optional(),
		notes: nonBlankStringSchema.optional(),
	})
	.strict();

export const createQueueItemRequestSchema = z
	.object({
		agentSelector: jsonValueSchema.nullable().optional(),
		machineSelector: jsonValueSchema.nullable().optional(),
		maxCostUsd: optionalNonNegativeNumberSchema,
		maxRuntimeMinutes: optionalPositiveIntegerSchema,
		priority: queuePrioritySchema.default("normal"),
		runAfter: optionalNullableIsoTimestampSchema,
		scheduleWindow: jsonValueSchema.nullable().optional(),
		task: nonBlankStringSchema,
	})
	.strict();

export const updateQueueItemRequestSchema = z
	.object({
		agentSelector: jsonValueSchema.nullable().optional(),
		machineSelector: jsonValueSchema.nullable().optional(),
		maxCostUsd: optionalNonNegativeNumberSchema,
		maxRuntimeMinutes: optionalPositiveIntegerSchema,
		priority: queuePrioritySchema.optional(),
		runAfter: optionalNullableIsoTimestampSchema,
		scheduleWindow: jsonValueSchema.nullable().optional(),
		status: runStatusSchema.optional(),
	})
	.strict();

export const upsertScheduledJobRequestSchema = z
	.object({
		agentSelector: jsonValueSchema.default({}),
		cron: nonBlankStringSchema.optional(),
		enabled: z.boolean().default(true),
		machineSelector: jsonValueSchema.default({}),
		name: nonBlankStringSchema,
		naturalLanguage: nonBlankStringSchema,
		nextRunAt: optionalNullableIsoTimestampSchema,
		taskTemplate: nonBlankStringSchema,
		timezone: nonBlankStringSchema.default("UTC"),
	})
	.strict();

export const updateScheduledJobRequestSchema = z
	.object({
		agentSelector: jsonValueSchema.optional(),
		cron: nonBlankStringSchema.optional(),
		enabled: z.boolean().optional(),
		machineSelector: jsonValueSchema.optional(),
		name: nonBlankStringSchema.optional(),
		naturalLanguage: nonBlankStringSchema.optional(),
		nextRunAt: optionalNullableIsoTimestampSchema,
		taskTemplate: nonBlankStringSchema.optional(),
		timezone: nonBlankStringSchema.optional(),
	})
	.strict();

export const updatePolicyRuleRequestSchema = z
	.object({
		action: nonBlankStringSchema.optional(),
		defaultDecision: policyDecisionSchema.optional(),
		enabled: z.boolean().optional(),
		matcher: jsonRecordSchema.optional(),
		reason: nonBlankStringSchema.optional(),
		risk: riskLevelSchema.optional(),
	})
	.strict();

export const listQuerySchema = z
	.object({
		limit: z.coerce.number().int().positive().max(200).default(50),
		status: runStatusSchema.optional(),
	})
	.strict();

export const limitQuerySchema = z
	.object({
		limit: z.coerce.number().int().positive().max(200).default(50),
	})
	.strict();

export const machineListQuerySchema = z
	.object({
		limit: z.coerce.number().int().positive().max(200).default(50),
		status: machineStatusSchema.optional(),
	})
	.strict();

export const approvalListQuerySchema = z
	.object({
		limit: z.coerce.number().int().positive().max(200).default(50),
		status: z.enum(["approved", "expired", "pending", "rejected"]).optional(),
	})
	.strict();

export const eventListQuerySchema = z
	.object({
		afterSeq: z.coerce.number().int().min(-1).default(-1),
		limit: z.coerce.number().int().positive().max(500).default(200),
	})
	.strict();

export const policyListQuerySchema = z
	.object({
		enabledOnly: z
			.enum(["false", "true"])
			.default("true")
			.transform((value) => value === "true"),
	})
	.strict();

export const metricsQuerySchema = z
	.object({
		from: z.iso.datetime().optional(),
		limit: z.coerce.number().int().positive().max(1000).default(200),
		to: z.iso.datetime().optional(),
	})
	.strict();

export const auditQuerySchema = z
	.object({
		limit: z.coerce.number().int().positive().max(500).default(100),
	})
	.strict();

export const inviteMemberRequestSchema = z
	.object({
		displayName: nonBlankStringSchema.optional(),
		email: z.email(),
		role: workspaceMemberRoleSchema.default("observer"),
	})
	.strict();

export const createEvalRunRequestSchema = z
	.object({
		agentKind: agentKindSchema.default("codex"),
		datasetId: nonBlankStringSchema.default("bugfix-smoke"),
		model: optionalNullableNonBlankStringSchema,
	})
	.strict();

export const updateRetentionPolicyRequestSchema = z
	.object({
		action: retentionActionSchema.optional(),
		resourceType: retentionResourceTypeSchema.optional(),
		retentionDays: z.number().int().positive().max(3650).optional(),
	})
	.strict();
