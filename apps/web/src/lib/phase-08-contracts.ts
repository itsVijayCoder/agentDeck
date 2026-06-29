import { agentKindSchema, privacyModeSchema } from "@agentdeck/db";
import { z } from "zod";

const nonBlankStringSchema = z.string().trim().min(1);

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
		machineId: nonBlankStringSchema,
		model: nonBlankStringSchema.optional(),
		privacyMode: privacyModeSchema,
		provider: nonBlankStringSchema.optional(),
		queueItemId: nonBlankStringSchema,
		runId: nonBlankStringSchema,
		scheduledJobId: nonBlankStringSchema.optional(),
		sessionId: nonBlankStringSchema,
		targetBranch: nonBlankStringSchema,
		task: nonBlankStringSchema,
		type: z.literal("run.dispatch"),
		workspaceId: nonBlankStringSchema,
	})
	.strict();

export type RunDispatchControlPayload = z.infer<typeof runDispatchControlMessageSchema>;
