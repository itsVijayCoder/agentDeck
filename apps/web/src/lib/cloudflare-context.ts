import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createOpenFusionRepositories, type OpenFusionRepositories } from "@openfusion/db";

export type OpenFusionBindings = CloudflareEnv & {
	OPENFUSION_ARTIFACTS: R2Bucket;
	OPENFUSION_DB: D1Database;
};

export async function getOpenFusionBindings(): Promise<OpenFusionBindings> {
	const { env } = await getCloudflareContext({ async: true });

	if (!env.OPENFUSION_DB || !env.OPENFUSION_ARTIFACTS) {
		throw new Error("OpenFusion Cloudflare bindings are not configured.");
	}

	return env as OpenFusionBindings;
}

export async function getRepositories(): Promise<OpenFusionRepositories> {
	const env = await getOpenFusionBindings();
	return createOpenFusionRepositories(env.OPENFUSION_DB);
}

export async function getR2(): Promise<R2Bucket> {
	const env = await getOpenFusionBindings();
	return env.OPENFUSION_ARTIFACTS;
}
