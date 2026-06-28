import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createAgentDeckRepositories, type AgentDeckRepositories } from "@agentdeck/db";
import type { SessionHub } from "@/do/session-hub";

export type AgentDeckBindings = CloudflareEnv & {
	AGENTDECK_ARTIFACTS: R2Bucket;
	AGENTDECK_DB: D1Database;
	SESSION_HUB: DurableObjectNamespace<SessionHub>;
};

export async function getAgentDeckBindings(): Promise<AgentDeckBindings> {
	const { env } = await getCloudflareContext({ async: true });

	if (!env.AGENTDECK_DB || !env.AGENTDECK_ARTIFACTS || !env.SESSION_HUB) {
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
