import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createAgentDeckRepositories, type AgentDeckRepositories } from "@agentdeck/db";
import type { SessionHub } from "@/do/session-hub";
import type { AgentDeckQueueMessage } from "@/lib/phase-08-contracts";
import type { RunWorkflowParams } from "@/workers/run-workflow";

export type AgentDeckBindings = CloudflareEnv & {
	AGENTDECK_ARTIFACTS: R2Bucket;
	AGENTDECK_DB: D1Database;
	AGENTDECK_QUEUE: Queue<AgentDeckQueueMessage>;
	RUN_WORKFLOW: Workflow<RunWorkflowParams>;
	SESSION_HUB: DurableObjectNamespace<SessionHub>;
};

export async function getAgentDeckBindings(): Promise<AgentDeckBindings> {
	const { env } = await getCloudflareContext({ async: true });

	if (!env.AGENTDECK_DB || !env.AGENTDECK_ARTIFACTS || !env.AGENTDECK_QUEUE || !env.RUN_WORKFLOW || !env.SESSION_HUB) {
		throw new Error("AgentDeck Cloudflare bindings are not configured.");
	}

	return env as AgentDeckBindings;
}

export async function getRepositories(): Promise<AgentDeckRepositories> {
	const env = await getAgentDeckBindings();
	return createAgentDeckRepositories(env.AGENTDECK_DB);
}

export async function getR2(): Promise<R2Bucket> {
	const env = await getAgentDeckBindings();
	return env.AGENTDECK_ARTIFACTS;
}

export async function getRunQueue(): Promise<Queue<AgentDeckQueueMessage>> {
	const env = await getAgentDeckBindings();
	return env.AGENTDECK_QUEUE;
}
