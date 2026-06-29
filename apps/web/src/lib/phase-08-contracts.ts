import { agentKindSchema, privacyModeSchema } from "@agentdeck/db";
import { z } from "zod";

const nonBlankStringSchema = z.string().trim().min(1);
const routingStrategySchema = z.enum(["cascade", "frontier-fallback", "local-only", "parallel-candidates", "single"]);

export const agentDeckQueueMessageSchema = z.discriminatedUnion("type", [
	z
		.object({
			queueItemId: nonBlankStringSchema,
			scheduledJobId: nonBlankStringSchema.optional(),
			type: z.literal("queue.item"),
		})
		.strict(),
]);

export type AgentDeckQueueMessage = z.infer<typeof agentDeckQueueMessageSchema>;

export const runDispatchControlMessageSchema = z
	.object({
		agentInstallationId: nonBlankStringSchema,
		agentKind: agentKindSchema,
		candidateId: nonBlankStringSchema.optional(),
		candidateLabel: nonBlankStringSchema.optional(),
		machineId: nonBlankStringSchema,
		model: nonBlankStringSchema.optional(),
		orchestrationId: nonBlankStringSchema.optional(),
		privacyMode: privacyModeSchema,
		provider: nonBlankStringSchema.optional(),
		queueItemId: nonBlankStringSchema,
		runId: nonBlankStringSchema,
		routingStrategy: routingStrategySchema.optional(),
		scheduledJobId: nonBlankStringSchema.optional(),
		sessionId: nonBlankStringSchema,
		targetBranch: nonBlankStringSchema,
		task: nonBlankStringSchema,
		type: z.literal("run.dispatch"),
		worktreeBranch: nonBlankStringSchema.optional(),
		workspaceId: nonBlankStringSchema,
	})
	.strict();

export type RunDispatchControlPayload = z.infer<typeof runDispatchControlMessageSchema>;
