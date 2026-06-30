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

export type LocalDispatchBindings = Pick<AgentDeckBindings, "AGENTDECK_DB" | "SESSION_HUB">;

async function getCloudflareEnv(): Promise<CloudflareEnv> {
	const { env } = await getCloudflareContext({ async: true });
	return env;
}

function requireBinding<T>(binding: T | undefined | null, name: keyof AgentDeckBindings): T {
	if (!binding) {
		throw new Error(`AgentDeck Cloudflare binding ${name} is not configured.`);
	}
	return binding;
}

export async function getAgentDeckBindings(): Promise<AgentDeckBindings> {
	const env = await getCloudflareEnv();

	if (!env.AGENTDECK_DB || !env.AGENTDECK_ARTIFACTS || !env.AGENTDECK_QUEUE || !env.RUN_WORKFLOW || !env.SESSION_HUB) {
		throw new Error("AgentDeck Cloudflare bindings are not configured.");
	}

	return env as AgentDeckBindings;
}

export async function getRepositories(): Promise<AgentDeckRepositories> {
	const env = await getCloudflareEnv();
	return createAgentDeckRepositories(requireBinding(env.AGENTDECK_DB, "AGENTDECK_DB"));
}

export async function getR2(): Promise<R2Bucket> {
	const env = await getCloudflareEnv();
	return requireBinding(env.AGENTDECK_ARTIFACTS, "AGENTDECK_ARTIFACTS");
}

export async function getRunQueue(): Promise<Queue<AgentDeckQueueMessage>> {
	const env = await getCloudflareEnv();
	return requireBinding(env.AGENTDECK_QUEUE, "AGENTDECK_QUEUE");
}

export async function getSessionHub(): Promise<DurableObjectNamespace<SessionHub>> {
	const env = await getCloudflareEnv();
	return requireBinding(env.SESSION_HUB, "SESSION_HUB");
}

export async function getLocalDispatchBindings(): Promise<LocalDispatchBindings> {
	const env = await getCloudflareEnv();
	return {
		AGENTDECK_DB: requireBinding(env.AGENTDECK_DB, "AGENTDECK_DB"),
		SESSION_HUB: requireBinding(env.SESSION_HUB, "SESSION_HUB"),
	};
}
