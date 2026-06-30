import { createAgentDeckRepositories, parseJsonColumn, type RetentionPolicyRow } from "@agentdeck/db";

export type RetentionEnv = {
	AGENTDECK_ARTIFACTS: R2Bucket;
	AGENTDECK_DB: D1Database;
};

export type RetentionResult = {
	archived: number;
	deleted: number;
	policies: number;
};

type RetentionRow = Record<string, string | number | null>;

export async function enforceRetention(env: RetentionEnv, now = new Date()): Promise<RetentionResult> {
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	const policies = await repositories.retentionPolicies.listAll(1000);
	let archived = 0;
	let deleted = 0;

	for (const policy of policies) {
		const result = await enforcePolicy(env, policy, now);
		archived += result.archived;
		deleted += result.deleted;
	}

	return { archived, deleted, policies: policies.length };
}

export function shouldRunRetention(now: Date): boolean {
	return now.getUTCMinutes() === 0 && now.getUTCHours() === 3;
}

async function enforcePolicy(env: RetentionEnv, policy: RetentionPolicyRow, now: Date): Promise<Omit<RetentionResult, "policies">> {
	const cutoff = new Date(now.getTime() - policy.retention_days * 86_400_000).toISOString();

	switch (policy.resource_type) {
		case "terminal-logs":
		case "transcripts":
			return enforceR2Prefix(env, policy, cutoff, `workspaces/${policy.workspace_id}/sessions/`);
		case "artifacts":
			return enforceArtifacts(env, policy, cutoff);
		case "reports":
			return enforceReports(env, policy, cutoff);
		case "events":
			return enforceD1Rows(env, policy, cutoff, {
				archivePrefix: "events",
				deleteSql: "DELETE FROM event_index WHERE workspace_id = ? AND created_at < ?",
				selectSql: "SELECT * FROM event_index WHERE workspace_id = ? AND created_at < ? LIMIT 500",
			});
		case "audit-log":
			return enforceD1Rows(env, policy, cutoff, {
				archivePrefix: "audit-log",
				deleteSql: "DELETE FROM audit_log WHERE workspace_id = ? AND created_at < ?",
				selectSql: "SELECT * FROM audit_log WHERE workspace_id = ? AND created_at < ? LIMIT 500",
			});
		case "metric-snapshots":
			return enforceD1Rows(env, policy, cutoff, {
				archivePrefix: "metrics",
				deleteSql: "DELETE FROM metric_snapshots WHERE workspace_id = ? AND created_at < ?",
				selectSql: "SELECT * FROM metric_snapshots WHERE workspace_id = ? AND created_at < ? LIMIT 500",
			});
		case "eval-runs":
			return enforceD1Rows(env, policy, cutoff, {
				archivePrefix: "evals",
				deleteSql: "DELETE FROM eval_runs WHERE workspace_id = ? AND created_at < ?",
				selectSql: "SELECT * FROM eval_runs WHERE workspace_id = ? AND created_at < ? LIMIT 500",
			});
	}
}

async function enforceR2Prefix(
	env: RetentionEnv,
	policy: RetentionPolicyRow,
	cutoff: string,
	prefix: string,
): Promise<Omit<RetentionResult, "policies">> {
	let archived = 0;
	let deleted = 0;
	const listed = await env.AGENTDECK_ARTIFACTS.list({ prefix });
	for (const object of listed.objects) {
		if (object.uploaded.toISOString() >= cutoff) {
			continue;
		}

		if (policy.action === "archive") {
			await env.AGENTDECK_ARTIFACTS.put(archiveKey(policy, object.key), JSON.stringify({ archivedObjectKey: object.key }), {
				httpMetadata: { contentType: "application/json" },
			});
			archived += 1;
		}
		await env.AGENTDECK_ARTIFACTS.delete(object.key);
		deleted += 1;
	}

	return { archived, deleted };
}

async function enforceArtifacts(
	env: RetentionEnv,
	policy: RetentionPolicyRow,
	cutoff: string,
): Promise<Omit<RetentionResult, "policies">> {
	const result = await env.AGENTDECK_DB.prepare(
		"SELECT id, object_key, workspace_id, created_at FROM artifacts WHERE workspace_id = ? AND created_at < ? LIMIT 500",
	)
		.bind(policy.workspace_id, cutoff)
		.all<RetentionRow>();
	let archived = 0;
	let deleted = 0;

	for (const row of result.results) {
		const objectKey = String(row.object_key);
		if (policy.action === "archive") {
			const object = await env.AGENTDECK_ARTIFACTS.get(objectKey);
			if (object?.body) {
				await env.AGENTDECK_ARTIFACTS.put(archiveKey(policy, objectKey), object.body, {
					httpMetadata: object.httpMetadata,
				});
				archived += 1;
			}
		}
		await env.AGENTDECK_ARTIFACTS.delete(objectKey);
		deleted += 1;
	}

	await env.AGENTDECK_DB.prepare("DELETE FROM artifacts WHERE workspace_id = ? AND created_at < ?").bind(policy.workspace_id, cutoff).run();
	return { archived, deleted };
}

async function enforceReports(
	env: RetentionEnv,
	policy: RetentionPolicyRow,
	cutoff: string,
): Promise<Omit<RetentionResult, "policies">> {
	const result = await env.AGENTDECK_DB.prepare(
		"SELECT id, object_key, report_json, workspace_id, created_at FROM decision_reports WHERE workspace_id = ? AND created_at < ? LIMIT 500",
	)
		.bind(policy.workspace_id, cutoff)
		.all<RetentionRow>();
	let archived = 0;

	if (policy.action === "archive") {
		for (const row of result.results) {
			await env.AGENTDECK_ARTIFACTS.put(
				archiveKey(policy, String(row.object_key ?? `reports/${row.id}.json`)),
				JSON.stringify(parseJsonColumn(String(row.report_json))),
				{ httpMetadata: { contentType: "application/json" } },
			);
			archived += 1;
		}
	}

	await env.AGENTDECK_DB.prepare("DELETE FROM decision_reports WHERE workspace_id = ? AND created_at < ?")
		.bind(policy.workspace_id, cutoff)
		.run();
	return { archived, deleted: result.results.length };
}

async function enforceD1Rows(
	env: RetentionEnv,
	policy: RetentionPolicyRow,
	cutoff: string,
	input: { archivePrefix: string; deleteSql: string; selectSql: string },
): Promise<Omit<RetentionResult, "policies">> {
	const result = await env.AGENTDECK_DB.prepare(input.selectSql).bind(policy.workspace_id, cutoff).all<RetentionRow>();
	let archived = 0;

	if (policy.action === "archive" && result.results.length > 0) {
		await env.AGENTDECK_ARTIFACTS.put(
			archiveKey(policy, `${input.archivePrefix}/${cutoff}.json`),
			JSON.stringify(result.results),
			{ httpMetadata: { contentType: "application/json" } },
		);
		archived = result.results.length;
	}

	await env.AGENTDECK_DB.prepare(input.deleteSql).bind(policy.workspace_id, cutoff).run();
	return { archived, deleted: result.results.length };
}

function archiveKey(policy: RetentionPolicyRow, sourceKey: string): string {
	return `workspaces/${policy.workspace_id}/archive/${policy.resource_type}/${sourceKey.replace(/^workspaces\/[^/]+\//u, "")}`;
}
