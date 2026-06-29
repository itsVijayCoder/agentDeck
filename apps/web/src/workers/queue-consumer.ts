import { createAgentDeckRepositories } from "@agentdeck/db";

import { agentDeckQueueMessageSchema, type AgentDeckQueueMessage } from "@/lib/phase-08-contracts";
import type { RunWorkflowParams } from "./run-workflow";

export type QueueConsumerEnv = {
	AGENTDECK_DB: D1Database;
	RUN_WORKFLOW: Workflow<RunWorkflowParams>;
};

export async function consumeQueue(batch: MessageBatch<AgentDeckQueueMessage>, env: QueueConsumerEnv): Promise<void> {
	for (const message of batch.messages) {
		await consumeQueueMessage(message, env);
	}
}

async function consumeQueueMessage(message: Message<AgentDeckQueueMessage>, env: QueueConsumerEnv): Promise<void> {
	const parsed = agentDeckQueueMessageSchema.parse(message.body);
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	const queueItem = await repositories.queue.findById(parsed.queueItemId);
	if (!queueItem) {
		throw new Error(`Queue item ${parsed.queueItemId} was not found.`);
	}

	if (queueItem.status === "completed" || queueItem.status === "cancelled") {
		message.ack();
		return;
	}

	try {
		await env.RUN_WORKFLOW.create({
			id: `run-${parsed.queueItemId}`,
			params: {
				queueItemId: parsed.queueItemId,
				...(parsed.scheduledJobId ? { scheduledJobId: parsed.scheduledJobId } : {}),
			},
		});
	} catch (error) {
		if (!isDuplicateWorkflowError(error)) {
			throw error;
		}
	}

	message.ack();
}

function isDuplicateWorkflowError(error: unknown): boolean {
	return error instanceof Error && /already exists|duplicate|exists/i.test(error.message);
}
