import { describe, expect, it } from "vitest";

import type { AgentDeckEvent } from "@agentdeck/core";
import {
	createAgentDeckRepositories,
	fromSqlBoolean,
	AgentDeckDatabaseError,
	parseJsonColumn,
	parseNullableJsonColumn,
	type QueryableD1,
	toSqlBoolean,
} from "./repositories";
import { writeAudit } from "./audit";
import { seedWorkspace } from "./seed";

const now = "2026-06-28T00:00:00.000Z";
const later = "2026-06-28T00:01:00.000Z";
const sha256 = "a".repeat(64);

const tableNames = [
	"workspaces",
	"users",
	"workspace_members",
	"machines",
	"agent_installations",
	"sessions",
	"runs",
	"event_index",
	"approvals",
	"queue_items",
	"scheduled_jobs",
	"artifacts",
	"decision_reports",
	"policy_rules",
	"audit_log",
	"metric_snapshots",
	"eval_runs",
	"retention_policies",
] as const;

type TableName = (typeof tableNames)[number];
type Row = Record<string, unknown>;

class MemoryD1 implements QueryableD1 {
	private readonly tables = new Map<TableName, Map<string, Row>>(
		tableNames.map((tableName) => [tableName, new Map<string, Row>()]),
	);

	prepare(query: string): D1PreparedStatement {
		return new MemoryStatement(this, query) as unknown as D1PreparedStatement;
	}

	run(sql: string, values: unknown[]): void {
		const normalized = normalizeSql(sql);

		if (normalized.startsWith("insert into workspaces")) {
			const [id, name, repository_url, default_branch, privacy_mode, created_at, updated_at] = values;
			this.put("workspaces", { default_branch, id, name, privacy_mode, repository_url, updated_at, created_at });
			return;
		}

		if (normalized.startsWith("insert into users")) {
			const [id, email, display_name, avatar_url, created_at, updated_at] = values;
			this.put("users", { avatar_url, created_at, display_name, email, id, updated_at });
			return;
		}

		if (normalized.startsWith("insert into workspace_members")) {
			const [id, workspace_id, user_id, role, invited_by, invited_at, joined_at, created_at] = values;
			const existing = this
				.rows("workspace_members")
				.find((row) => row.workspace_id === workspace_id && row.user_id === user_id);
			this.put("workspace_members", {
				created_at,
				id: existing?.id ?? id,
				invited_at,
				invited_by,
				joined_at,
				role,
				user_id,
				workspace_id,
			});
			return;
		}

		if (normalized.startsWith("insert into machines")) {
			const [id, workspace_id, display_name, os, arch, bridge_version, status, last_seen_at, revoked_at, created_at, updated_at] =
				values;
			this.put("machines", {
				arch,
				bridge_version,
				created_at,
				display_name,
				id,
				last_seen_at,
				os,
				revoked_at,
				status,
				updated_at,
				workspace_id,
			});
			return;
		}

		if (normalized.startsWith("update machines set")) {
			const [status, revoked_at, updated_at, id] = values;
			this.patch("machines", id, { revoked_at, status, updated_at });
			return;
		}

		if (normalized.startsWith("insert into agent_installations")) {
			const [id, machine_id, agent_kind, command, version, auth_status, capabilities_json, detected_at, updated_at] = values;
			const existing = this
				.rows("agent_installations")
				.find((row) => row.machine_id === machine_id && row.agent_kind === agent_kind && row.command === command);
			this.put("agent_installations", {
				agent_kind,
				auth_status,
				capabilities_json,
				command,
				detected_at,
				id: existing?.id ?? id,
				machine_id,
				updated_at,
				version,
			});
			return;
		}

		if (normalized.startsWith("insert into sessions")) {
			const [id, workspace_id, parent_session_id, title, status, privacy_mode, created_by, created_at, updated_at] = values;
			this.put("sessions", {
				created_at,
				created_by,
				id,
				parent_session_id,
				privacy_mode,
				status,
				title,
				updated_at,
				workspace_id,
			});
			return;
		}

		if (normalized.startsWith("update sessions set")) {
			const [status, updated_at, id] = values;
			this.patch("sessions", id, { status, updated_at });
			return;
		}

		if (normalized.startsWith("insert into runs")) {
			const [
				id,
				session_id,
				queue_item_id,
				scheduled_job_id,
				machine_id,
				agent_installation_id,
				task,
				worktree_path_hash,
				branch_name,
				status,
				cost_usd,
				latency_ms,
				confidence,
				started_at,
				completed_at,
				created_at,
				updated_at,
			] = values;
			this.put("runs", {
				agent_installation_id,
				branch_name,
				completed_at,
				confidence,
				cost_usd,
				created_at,
				id,
				latency_ms,
				machine_id,
				queue_item_id,
				scheduled_job_id,
				session_id,
				started_at,
				status,
				task,
				updated_at,
				worktree_path_hash,
			});
			return;
		}

		if (normalized.startsWith("update runs set")) {
			const [status, cost_usd, latency_ms, confidence, started_at, completed_at, updated_at, id] = values;
			this.patch("runs", id, { completed_at, confidence, cost_usd, latency_ms, started_at, status, updated_at });
			return;
		}

		if (normalized.startsWith("insert into event_index")) {
			const [id, workspace_id, session_id, run_id, seq, type, source, visibility, object_key, payload_hash, trace_id, created_at] =
				values;
			this.put("event_index", {
				created_at,
				id,
				object_key,
				payload_hash,
				run_id,
				seq,
				session_id,
				source,
				trace_id,
				type,
				visibility,
				workspace_id,
			});
			return;
		}

		if (normalized.startsWith("insert into approvals")) {
			const [
				id,
				workspace_id,
				session_id,
				run_id,
				kind,
				title,
				risk,
				status,
				requested_action_json,
				decision_json,
				decided_by,
				expires_at,
				created_at,
				decided_at,
			] = values;
			this.put("approvals", {
				created_at,
				decided_at,
				decided_by,
				decision_json,
				expires_at,
				id,
				kind,
				requested_action_json,
				risk,
				run_id,
				session_id,
				status,
				title,
				workspace_id,
			});
			return;
		}

		if (normalized.startsWith("update approvals set")) {
			const [status, decision_json, decided_by, decided_at, id] = values;
			this.patch("approvals", id, { decided_at, decided_by, decision_json, status });
			return;
		}

		if (normalized.startsWith("insert into queue_items")) {
			const [
				id,
				workspace_id,
				created_by,
				task,
				priority,
				status,
				run_after,
				schedule_window_json,
				agent_selector_json,
				machine_selector_json,
				max_cost_usd,
				max_runtime_minutes,
				created_at,
				updated_at,
			] = values;
			this.put("queue_items", {
				agent_selector_json,
				cancelled_at: null,
				created_at,
				created_by,
				id,
				machine_selector_json,
				max_cost_usd,
				max_runtime_minutes,
				priority,
				run_after,
				schedule_window_json,
				status,
				task,
				updated_at,
				workspace_id,
			});
			return;
		}

		if (normalized.startsWith("update queue_items set")) {
			const [
				priority,
				status,
				run_after,
				schedule_window_json,
				agent_selector_json,
				machine_selector_json,
				max_cost_usd,
				max_runtime_minutes,
				cancelled_at,
				updated_at,
				id,
			] = values;
			this.patch("queue_items", id, {
				agent_selector_json,
				cancelled_at,
				machine_selector_json,
				max_cost_usd,
				max_runtime_minutes,
				priority,
				run_after,
				schedule_window_json,
				status,
				updated_at,
			});
			return;
		}

		if (normalized.startsWith("insert into scheduled_jobs")) {
			const [
				id,
				workspace_id,
				name,
				natural_language,
				cron,
				timezone,
				enabled,
				task_template,
				agent_selector_json,
				machine_selector_json,
				next_run_at,
				last_run_at,
				last_status,
				created_at,
				updated_at,
			] = values;
			this.put("scheduled_jobs", {
				agent_selector_json,
				created_at,
				cron,
				enabled,
				id,
				last_run_at,
				last_status,
				machine_selector_json,
				name,
				natural_language,
				next_run_at,
				task_template,
				timezone,
				updated_at,
				workspace_id,
			});
			return;
		}

		if (normalized.startsWith("insert into artifacts")) {
			const [id, workspace_id, session_id, run_id, kind, object_key, mime_type, size_bytes, sha256_value, redaction_status, created_at] =
				values;
			this.put("artifacts", {
				created_at,
				id,
				kind,
				mime_type,
				object_key,
				redaction_status,
				run_id,
				session_id,
				sha256: sha256_value,
				size_bytes,
				workspace_id,
			});
			return;
		}

		if (normalized.startsWith("insert into decision_reports")) {
			const [id, workspace_id, session_id, summary, recommendation, confidence, cost_usd, latency_ms, report_json, object_key, created_at] =
				values;
			this.put("decision_reports", {
				confidence,
				cost_usd,
				created_at,
				id,
				latency_ms,
				object_key,
				recommendation,
				report_json,
				session_id,
				summary,
				workspace_id,
			});
			return;
		}

		if (normalized.startsWith("insert into policy_rules")) {
			const [id, workspace_id, action, default_decision, risk, reason, matcher_json, enabled, created_at, updated_at] = values;
			this.put("policy_rules", {
				action,
				created_at,
				default_decision,
				enabled,
				id,
				matcher_json,
				reason,
				risk,
				updated_at,
				workspace_id,
			});
			return;
		}

		if (normalized.startsWith("insert into audit_log")) {
			const [id, workspace_id, actor_id, action, resource_type, resource_id, details_json, ip_address, user_agent, created_at] = values;
			this.put("audit_log", {
				action,
				actor_id,
				created_at,
				details_json,
				id,
				ip_address,
				resource_id,
				resource_type,
				user_agent,
				workspace_id,
			});
			return;
		}

		if (normalized.startsWith("insert into metric_snapshots")) {
			const [id, workspace_id, metric_name, metric_value, labels_json, period_start, period_end, created_at] = values;
			this.put("metric_snapshots", {
				created_at,
				id,
				labels_json,
				metric_name,
				metric_value,
				period_end,
				period_start,
				workspace_id,
			});
			return;
		}

		if (normalized.startsWith("insert into eval_runs")) {
			const [id, workspace_id, dataset_id, agent_kind, model, status, score, results_json, started_at, completed_at, created_at] =
				values;
			this.put("eval_runs", {
				agent_kind,
				completed_at,
				created_at,
				dataset_id,
				id,
				model,
				results_json,
				score,
				started_at,
				status,
				workspace_id,
			});
			return;
		}

		if (normalized.startsWith("update eval_runs set")) {
			const [status, score, results_json, completed_at, id] = values;
			this.patch("eval_runs", id, { completed_at, results_json, score, status });
			return;
		}

		if (normalized.startsWith("insert into retention_policies")) {
			const [id, workspace_id, resource_type, retention_days, action, created_at, updated_at] = values;
			const existing = this
				.rows("retention_policies")
				.find((row) => row.workspace_id === workspace_id && row.resource_type === resource_type);
			this.put("retention_policies", {
				action,
				created_at,
				id: existing?.id ?? id,
				resource_type,
				retention_days,
				updated_at,
				workspace_id,
			});
			return;
		}

		if (normalized === "delete from workspace_members where id = ?") {
			this.table("workspace_members").delete(String(values[0]));
			return;
		}

		throw new Error(`Unhandled SQL: ${normalized}`);
	}

	select(sql: string, values: unknown[]): Row[] {
		const normalized = normalizeSql(sql);

		if (normalized === "select * from agent_installations where machine_id = ? and agent_kind = ? and command = ?") {
			const [machineId, agentKind, command] = values;
			return this.rows("agent_installations").filter(
				(row) => row.machine_id === machineId && row.agent_kind === agentKind && row.command === command,
			);
		}

		if (normalized === "select coalesce(max(seq), -1) + 1 as seq from event_index where session_id = ?") {
			const seq = this.rows("event_index")
				.filter((row) => row.session_id === values[0])
				.reduce((max, row) => Math.max(max, Number(row.seq)), -1);
			return [{ seq: seq + 1 }];
		}

		if (normalized === "select * from users where email = ?") {
			return this.rows("users").filter((row) => row.email === values[0]);
		}

		if (normalized === "select * from workspace_members where workspace_id = ? and user_id = ?") {
			return this.rows("workspace_members").filter((row) => row.workspace_id === values[0] && row.user_id === values[1]);
		}

		const idMatch = /^select \* from ([a-z_]+) where id = \?$/.exec(normalized);
		if (idMatch && isTableName(idMatch[1])) {
			const row = this.table(idMatch[1]).get(String(values[0]));
			return row ? [row] : [];
		}

		if (normalized === "select * from workspaces order by updated_at desc limit ?") {
			return limitRows(this.rows("workspaces"), values[0]);
		}

		if (normalized.includes("from workspace_members where workspace_id = ?")) {
			return limitRows(this.rows("workspace_members").filter((row) => row.workspace_id === values[0]), values[1]);
		}

		if (normalized.includes("from machines where workspace_id = ? and status = ?")) {
			return limitRows(this.rows("machines").filter((row) => row.workspace_id === values[0] && row.status === values[1]), values[2]);
		}

		if (normalized.includes("from machines where workspace_id = ? order")) {
			return limitRows(this.rows("machines").filter((row) => row.workspace_id === values[0]), values[1]);
		}

		if (normalized.includes("from agent_installations where machine_id = ?")) {
			return this.rows("agent_installations").filter((row) => row.machine_id === values[0]);
		}

		if (normalized.includes("from sessions where workspace_id = ? and status = ?")) {
			return limitRows(this.rows("sessions").filter((row) => row.workspace_id === values[0] && row.status === values[1]), values[2]);
		}

		if (normalized.includes("from sessions where workspace_id = ? order")) {
			return limitRows(this.rows("sessions").filter((row) => row.workspace_id === values[0]), values[1]);
		}

		if (normalized.includes("from runs where session_id = ?")) {
			return limitRows(this.rows("runs").filter((row) => row.session_id === values[0]), values[1]);
		}

		if (normalized.includes("from runs where queue_item_id = ?")) {
			return limitRows(this.rows("runs").filter((row) => row.queue_item_id === values[0]), values[1]);
		}

		if (normalized.includes("select count(*) as count from runs where machine_id = ?")) {
			const activeStatuses = new Set(["queued", "waiting-machine", "running", "waiting-approval", "paused", "verifying"]);
			return [
				{
					count: this.rows("runs").filter((row) => row.machine_id === values[0] && activeStatuses.has(String(row.status))).length,
				},
			];
		}

		if (normalized.includes("from event_index where session_id = ? and seq > ?")) {
			return limitRows(
				this.rows("event_index")
					.filter((row) => row.session_id === values[0] && Number(row.seq) > Number(values[1]))
					.sort((left, right) => Number(left.seq) - Number(right.seq)),
				values[2],
			);
		}

		if (normalized.includes("from approvals where workspace_id = ? and status = ?")) {
			return limitRows(this.rows("approvals").filter((row) => row.workspace_id === values[0] && row.status === values[1]), values[2]);
		}

		if (normalized.includes("from approvals where workspace_id = ? order")) {
			return limitRows(this.rows("approvals").filter((row) => row.workspace_id === values[0]), values[1]);
		}

		if (normalized.includes("from approvals where run_id = ?")) {
			return limitRows(this.rows("approvals").filter((row) => row.run_id === values[0]), values[1]);
		}

		if (normalized.includes("from queue_items where workspace_id = ? and status = ?")) {
			return limitRows(this.rows("queue_items").filter((row) => row.workspace_id === values[0] && row.status === values[1]), values[2]);
		}

		if (normalized.includes("from queue_items where workspace_id = ? and created_at >= ?")) {
			return limitRows(
				this.rows("queue_items").filter((row) => row.workspace_id === values[0] && String(row.created_at) >= String(values[1])),
				values[2],
			);
		}

		if (normalized.includes("from queue_items where workspace_id = ? order")) {
			return limitRows(this.rows("queue_items").filter((row) => row.workspace_id === values[0]), values[1]);
		}

		if (normalized.includes("from scheduled_jobs where enabled = 1")) {
			return limitRows(
				this.rows("scheduled_jobs").filter(
					(row) => row.enabled === 1 && typeof row.next_run_at === "string" && row.next_run_at <= String(values[0]),
				),
				values[1],
			);
		}

		if (normalized.includes("from scheduled_jobs where workspace_id = ?")) {
			return limitRows(this.rows("scheduled_jobs").filter((row) => row.workspace_id === values[0]), values[1]);
		}

		if (normalized.includes("from artifacts where session_id = ?")) {
			return limitRows(this.rows("artifacts").filter((row) => row.session_id === values[0]), values[1]);
		}

		if (normalized.includes("from decision_reports where workspace_id = ?")) {
			return limitRows(this.rows("decision_reports").filter((row) => row.workspace_id === values[0]), values[1]);
		}

		if (normalized.includes("from policy_rules where workspace_id = ? and enabled = 1")) {
			return this.rows("policy_rules").filter((row) => row.workspace_id === values[0] && row.enabled === 1);
		}

		if (normalized.includes("from policy_rules where workspace_id = ? order")) {
			return this.rows("policy_rules").filter((row) => row.workspace_id === values[0]);
		}

		if (normalized.includes("from audit_log where workspace_id = ?")) {
			return limitRows(this.rows("audit_log").filter((row) => row.workspace_id === values[0]), values[1]);
		}

		if (normalized.includes("from metric_snapshots")) {
			return limitRows(
				this.rows("metric_snapshots").filter(
					(row) =>
						row.workspace_id === values[0] &&
						String(row.period_start) >= String(values[1]) &&
						String(row.period_end) <= String(values[2]),
				),
				values[3],
			);
		}

		if (normalized.includes("from eval_runs where workspace_id = ?")) {
			return limitRows(this.rows("eval_runs").filter((row) => row.workspace_id === values[0]), values[1]);
		}

		if (normalized === "select * from retention_policies where workspace_id = ? and resource_type = ?") {
			return this.rows("retention_policies").filter((row) => row.workspace_id === values[0] && row.resource_type === values[1]);
		}

		if (normalized.includes("from retention_policies where workspace_id = ?")) {
			return limitRows(this.rows("retention_policies").filter((row) => row.workspace_id === values[0]), values[1]);
		}

		if (normalized.includes("from retention_policies order by workspace_id")) {
			return limitRows(this.rows("retention_policies"), values[0]);
		}

		throw new Error(`Unhandled SQL: ${normalized}`);
	}

	private patch(tableName: TableName, idValue: unknown, patch: Row): void {
		const id = String(idValue);
		const existing = this.table(tableName).get(id);
		if (existing) {
			this.table(tableName).set(id, { ...existing, ...patch });
		}
	}

	private put(tableName: TableName, row: Row): void {
		this.table(tableName).set(String(row.id), row);
	}

	private rows(tableName: TableName): Row[] {
		return [...this.table(tableName).values()];
	}

	private table(tableName: TableName): Map<string, Row> {
		const table = this.tables.get(tableName);
		if (!table) {
			throw new Error(`Unknown table: ${tableName}`);
		}
		return table;
	}
}

class MemoryStatement {
	constructor(
		private readonly db: MemoryD1,
		private readonly query: string,
		private readonly values: unknown[] = [],
	) {}

	bind(...values: unknown[]): D1PreparedStatement {
		return new MemoryStatement(this.db, this.query, values) as unknown as D1PreparedStatement;
	}

	async first<T = Record<string, unknown>>(): Promise<T | null> {
		return (this.db.select(this.query, this.values)[0] as T | undefined) ?? null;
	}

	async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
		this.db.run(this.query, this.values);
		return { meta: {}, results: [], success: true } as unknown as D1Result<T>;
	}

	async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
		return { meta: {}, results: this.db.select(this.query, this.values) as T[], success: true } as unknown as D1Result<T>;
	}

	async raw<T = unknown[]>(): Promise<T[]> {
		return [] as T[];
	}
}

class FailedRunD1 implements QueryableD1 {
	prepare(): D1PreparedStatement {
		return new FailedRunStatement() as unknown as D1PreparedStatement;
	}
}

class FailedRunStatement {
	bind(): D1PreparedStatement {
		return this as unknown as D1PreparedStatement;
	}

	async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
		return { meta: {}, results: [], success: false } as unknown as D1Result<T>;
	}
}

class ThrowRunD1 implements QueryableD1 {
	prepare(): D1PreparedStatement {
		return new ThrowRunStatement() as unknown as D1PreparedStatement;
	}
}

class ThrowRunStatement {
	bind(): D1PreparedStatement {
		return this as unknown as D1PreparedStatement;
	}

	async run(): Promise<D1Result> {
		throw new Error("write failed");
	}
}

class ThrowFirstD1 implements QueryableD1 {
	prepare(): D1PreparedStatement {
		return new ThrowFirstStatement() as unknown as D1PreparedStatement;
	}
}

class ThrowFirstStatement {
	bind(): D1PreparedStatement {
		return this as unknown as D1PreparedStatement;
	}

	async first(): Promise<null> {
		throw new Error("read failed");
	}
}

class ThrowAllD1 implements QueryableD1 {
	prepare(): D1PreparedStatement {
		return new ThrowAllStatement() as unknown as D1PreparedStatement;
	}
}

class ThrowAllStatement {
	bind(): D1PreparedStatement {
		return this as unknown as D1PreparedStatement;
	}

	async all(): Promise<D1Result> {
		throw new Error("list failed");
	}
}

class MissingRowAfterWriteD1 implements QueryableD1 {
	prepare(): D1PreparedStatement {
		return new MissingRowAfterWriteStatement() as unknown as D1PreparedStatement;
	}
}

class MissingRowAfterWriteStatement {
	bind(): D1PreparedStatement {
		return this as unknown as D1PreparedStatement;
	}

	async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
		return { meta: {}, results: [], success: true } as unknown as D1Result<T>;
	}

	async first(): Promise<null> {
		return null;
	}
}

describe("AgentDeck D1 repositories", () => {
	it("writes and reads every existing repository contract through a D1 test double", async () => {
		const repositories = createAgentDeckRepositories(new MemoryD1());

		const workspace = await repositories.workspaces.create({
			createdAt: now,
			defaultBranch: "main",
			id: "ws_01",
			name: "AgentDeck",
			privacyMode: "metadata-only",
			repositoryUrl: "https://github.com/example/agentdeck",
			updatedAt: now,
		});
		expect(workspace.repository_url).toBe("https://github.com/example/agentdeck");
		expect(await repositories.workspaces.findById("ws_01")).toEqual(workspace);
		expect(await repositories.workspaces.list()).toHaveLength(1);

		const user = await repositories.users.upsert({
			createdAt: now,
			displayName: "Vijay",
			email: "vijay@example.com",
			id: "user_01",
			updatedAt: now,
		});
		expect(user.email).toBe("vijay@example.com");
		expect(await repositories.users.findById("user_01")).toEqual(user);
		expect(await repositories.users.findByEmail("vijay@example.com")).toEqual(user);

		const member = await repositories.workspaceMembers.upsert({
			createdAt: now,
			id: "member_01",
			invitedAt: now,
			joinedAt: now,
			role: "owner",
			userId: user.id,
			workspaceId: workspace.id,
		});
		expect(member.role).toBe("owner");
		expect(await repositories.workspaceMembers.findById("member_01")).toEqual(member);
		expect(await repositories.workspaceMembers.findByWorkspaceUser(workspace.id, user.id)).toEqual(member);
		expect(await repositories.workspaceMembers.listByWorkspace(workspace.id)).toHaveLength(1);

		const machine = await repositories.machines.upsert({
			arch: "arm64",
			bridgeVersion: "0.1.0",
			createdAt: now,
			displayName: "Mac Studio",
			id: "machine_01",
			lastSeenAt: now,
			os: "darwin",
			status: "online",
			updatedAt: now,
			workspaceId: "ws_01",
		});
		expect(machine.status).toBe("online");
		expect(await repositories.machines.findById("machine_01")).toEqual(machine);
		expect(await repositories.machines.listByWorkspace("ws_01", "online")).toHaveLength(1);
		expect(await repositories.machines.listByWorkspace("ws_01")).toHaveLength(1);
		expect((await repositories.machines.revoke("machine_01", later))?.status).toBe("revoked");

		const agent = await repositories.agentInstallations.upsert({
			agentKind: "codex",
			authStatus: "configured",
			capabilities: ["terminal", "code-edit"],
			command: "codex",
			detectedAt: now,
			id: "agent_01",
			machineId: "machine_01",
			updatedAt: now,
			version: "1.0.0",
		});
		expect(parseJsonColumn(agent.capabilities_json)).toEqual(["terminal", "code-edit"]);
		expect(await repositories.agentInstallations.findById("agent_01")).toEqual(agent);
		expect(await repositories.agentInstallations.listByMachine("machine_01")).toHaveLength(1);

		const session = await repositories.sessions.create({
			createdAt: now,
			createdBy: "user_01",
			id: "sess_01",
			privacyMode: "metadata-only",
			title: "Foundation",
			updatedAt: now,
			workspaceId: "ws_01",
		});
		expect(session.status).toBe("draft");
		expect(await repositories.sessions.findById("sess_01")).toEqual(session);
		expect(await repositories.sessions.listByWorkspace("ws_01", "draft")).toHaveLength(1);
		expect(await repositories.sessions.listByWorkspace("ws_01")).toHaveLength(1);
		expect((await repositories.sessions.updateStatus("sess_01", "running", later))?.status).toBe("running");

		const queueItem = await repositories.queue.enqueue({
			agentSelector: { kind: "codex" },
			createdAt: now,
			createdBy: "user_01",
			id: "queue_01",
			machineSelector: { id: "machine_01" },
			maxCostUsd: 10,
			maxRuntimeMinutes: 60,
			priority: "high",
			runAfter: now,
			scheduleWindow: { start: now },
			task: "Queue a run",
			updatedAt: now,
			workspaceId: "ws_01",
		});
		expect(queueItem.status).toBe("queued");
		expect(parseNullableJsonColumn(queueItem.agent_selector_json)).toEqual({ kind: "codex" });
		expect(await repositories.queue.findById("queue_01")).toEqual(queueItem);
		expect(await repositories.queue.listByWorkspace("ws_01", "queued")).toHaveLength(1);
		expect(await repositories.queue.listByWorkspace("ws_01")).toHaveLength(1);
		expect(await repositories.queue.listByWorkspaceSince("ws_01", now)).toHaveLength(1);
		expect(await repositories.queue.listByWorkspaceSince("ws_01", later)).toHaveLength(0);
		expect(
			await repositories.queue.update({
				id: "queue_01",
				priority: "urgent",
				scheduleWindow: null,
				status: "waiting-machine",
				updatedAt: later,
			}),
		).toMatchObject({ priority: "urgent", schedule_window_json: null, status: "waiting-machine" });
		expect(await repositories.queue.update({ id: "missing_queue", status: "failed" })).toBeNull();

		const scheduledJob = await repositories.scheduledJobs.upsert({
			agentSelector: { kind: "codex" },
			createdAt: now,
			cron: "0 8 * * *",
			enabled: true,
			id: "schedule_01",
			lastStatus: "success",
			machineSelector: { id: "machine_01" },
			name: "Morning report",
			naturalLanguage: "Run every morning",
			nextRunAt: now,
			taskTemplate: "Summarize repository status",
			timezone: "Asia/Kolkata",
			updatedAt: now,
			workspaceId: "ws_01",
		});
		expect(scheduledJob.enabled).toBe(1);
		expect(await repositories.scheduledJobs.findById("schedule_01")).toEqual(scheduledJob);
		expect(await repositories.scheduledJobs.listByWorkspace("ws_01")).toHaveLength(1);
		expect(await repositories.scheduledJobs.listDue(later)).toHaveLength(1);

		const run = await repositories.runs.create({
			agentInstallationId: "agent_01",
			branchName: "feature/foundation",
			createdAt: now,
			id: "run_01",
			machineId: "machine_01",
			queueItemId: "queue_01",
			scheduledJobId: "schedule_01",
			sessionId: "sess_01",
			status: "running",
			task: "Wire Phase 00 quality gates",
			updatedAt: now,
			worktreePathHash: "hash_01",
		});
		expect(run.status).toBe("running");
		expect(await repositories.runs.findById("run_01")).toEqual(run);
		expect(await repositories.runs.listBySession("sess_01")).toHaveLength(1);
		expect(await repositories.runs.listByQueueItem("queue_01")).toHaveLength(1);
		expect(await repositories.runs.countActiveByMachine("machine_01")).toBe(1);
		expect(
			await repositories.runs.updateStatus({
				completedAt: later,
				confidence: 0.92,
				costUsd: 1.25,
				id: "run_01",
				latencyMs: 1500,
				status: "completed",
				updatedAt: later,
			}),
		).toMatchObject({ completed_at: later, status: "completed" });
		expect(await repositories.runs.countActiveByMachine("machine_01")).toBe(0);
		expect(await repositories.runs.updateStatus({ id: "missing", status: "failed" })).toBeNull();

		const event: AgentDeckEvent = {
			createdAt: now,
			hash: "hash",
			id: "evt_01",
			payload: { task: "Wire Phase 00 quality gates", targetBranch: "main" },
			runId: "run_01",
			seq: 0,
			sessionId: "sess_01",
			source: "worker",
			traceId: "trace_01",
			type: "run.created",
			visibility: "metadata",
			workspaceId: "ws_01",
		};
		const eventRow = await repositories.events.append({ event, objectKey: "events/ws_01/sess_01/evt_01.json" });
		expect(eventRow.payload_hash).toBe("hash");
		expect(await repositories.events.listBySession("sess_01")).toHaveLength(1);
		expect(await repositories.events.nextSeq("sess_01")).toBe(1);

		const approval = await repositories.approvals.create({
			createdAt: now,
			expiresAt: later,
			id: "approval_01",
			kind: "command",
			requestedAction: { command: "npm install" },
			risk: "medium",
			runId: "run_01",
			sessionId: "sess_01",
			title: "Install dependencies",
			workspaceId: "ws_01",
		});
		expect(approval.status).toBe("pending");
		expect(await repositories.approvals.findById("approval_01")).toEqual(approval);
		expect(await repositories.approvals.listByRun("run_01")).toHaveLength(1);
		expect(await repositories.approvals.listByWorkspace("ws_01", "pending")).toHaveLength(1);
		expect(await repositories.approvals.listByWorkspace("ws_01")).toHaveLength(1);
		expect(
			await repositories.approvals.decide({
				decidedAt: later,
				decidedBy: "user_01",
				decision: { notes: "Approved once" },
				id: "approval_01",
				status: "approved",
			}),
		).toMatchObject({ decided_by: "user_01", status: "approved" });

		const artifact = await repositories.artifacts.create({
			createdAt: now,
			id: "artifact_01",
			kind: "terminal-log",
			mimeType: "text/plain",
			objectKey: "artifacts/log.txt",
			redactionStatus: "redacted",
			runId: "run_01",
			sessionId: "sess_01",
			sha256,
			sizeBytes: 2048,
			workspaceId: "ws_01",
		});
		expect(artifact.object_key).toBe("artifacts/log.txt");
		expect(await repositories.artifacts.findById("artifact_01")).toEqual(artifact);
		expect(await repositories.artifacts.listBySession("sess_01")).toHaveLength(1);

		const report = await repositories.decisionReports.create({
			confidence: 0.86,
			costUsd: 1.5,
			createdAt: now,
			id: "report_01",
			latencyMs: 2500,
			objectKey: "reports/report_01.json",
			recommendation: "review-carefully",
			report: { summary: "Review carefully" },
			sessionId: "sess_01",
			summary: "Candidate comparison complete",
			workspaceId: "ws_01",
		});
		expect(parseJsonColumn(report.report_json)).toEqual({ summary: "Review carefully" });
		expect(await repositories.decisionReports.findById("report_01")).toEqual(report);
		expect(await repositories.decisionReports.listByWorkspace("ws_01")).toHaveLength(1);

		const rule = await repositories.policyRules.upsert({
			action: "Install dependencies",
			createdAt: now,
			defaultDecision: "approval",
			enabled: true,
			id: "policy_01",
			matcher: { command: "npm install" },
			reason: "Supply chain risk",
			risk: "medium",
			updatedAt: now,
			workspaceId: "ws_01",
		});
		expect(rule.enabled).toBe(1);
		expect(await repositories.policyRules.findById("policy_01")).toEqual(rule);
		expect(await repositories.policyRules.listByWorkspace("ws_01")).toHaveLength(1);
		expect(await repositories.policyRules.listByWorkspace("ws_01", false)).toHaveLength(1);

		const auditEntry = await repositories.auditLog.create({
			action: "approval.decided",
			actorId: "user_01",
			createdAt: now,
			details: { status: "approved" },
			id: "audit_01",
			ipAddress: "127.0.0.1",
			resourceId: "approval_01",
			resourceType: "approval",
			userAgent: "vitest",
			workspaceId: "ws_01",
		});
		expect(parseNullableJsonColumn(auditEntry.details_json)).toEqual({ status: "approved" });
		expect(await repositories.auditLog.listByWorkspace("ws_01")).toHaveLength(1);
		await writeAudit(repositories, {
			action: "terminal.jump_in",
			actorId: "user_01",
			resourceId: "run_01",
			resourceType: "terminal",
			workspaceId: "ws_01",
		});
		await writeAudit(new MemoryD1(), {
			action: "session.created",
			resourceId: "session_missing_workspace",
			resourceType: "session",
			workspaceId: "ws_missing",
		});
		expect(await repositories.auditLog.listByWorkspace("ws_01")).toHaveLength(2);

		const metric = await repositories.metricSnapshots.create({
			createdAt: now,
			id: "metric_01",
			labels: { source: "workflow" },
			metricName: "run_count",
			metricValue: 1,
			periodEnd: later,
			periodStart: now,
			workspaceId: "ws_01",
		});
		expect(parseJsonColumn(metric.labels_json)).toEqual({ source: "workflow" });
		expect(await repositories.metricSnapshots.listByWorkspace("ws_01", now, later)).toHaveLength(1);

		const evalRun = await repositories.evalRuns.create({
			agentKind: "codex",
			completedAt: later,
			createdAt: now,
			datasetId: "bugfix-50",
			id: "eval_01",
			model: "gpt-5",
			results: [{ taskId: "bf-001", status: "passed" }],
			score: 0.91,
			startedAt: now,
			status: "completed",
			workspaceId: "ws_01",
		});
		expect(evalRun.status).toBe("completed");
		expect(await repositories.evalRuns.findById("eval_01")).toEqual(evalRun);
		expect(await repositories.evalRuns.listByWorkspace("ws_01")).toHaveLength(1);
		expect(
			await repositories.evalRuns.update({
				id: "eval_01",
				results: { rerun: true },
				score: 0.95,
				status: "completed",
			}),
		).toMatchObject({ score: 0.95, status: "completed" });
		expect(await repositories.evalRuns.update({ id: "missing", status: "failed" })).toBeNull();

		const retentionPolicy = await repositories.retentionPolicies.upsert({
			action: "archive",
			createdAt: now,
			id: "retention_01",
			resourceType: "events",
			retentionDays: 90,
			updatedAt: now,
			workspaceId: "ws_01",
		});
		expect(retentionPolicy.resource_type).toBe("events");
		expect(await repositories.retentionPolicies.findById("retention_01")).toEqual(retentionPolicy);
		expect(await repositories.retentionPolicies.listByWorkspace("ws_01")).toHaveLength(1);
		expect(await repositories.retentionPolicies.listAll()).toHaveLength(1);
		expect(await repositories.workspaceMembers.remove("member_01")).toBe(true);
		expect(await repositories.workspaceMembers.remove("member_01")).toBe(false);
	});

	it("applies repository defaults for optional input fields", async () => {
		const repositories = createAgentDeckRepositories(new MemoryD1());

		const workspace = await repositories.workspaces.create({
			id: "ws_min",
			name: "Minimal workspace",
			privacyMode: "local-only",
		});
		expect(workspace.default_branch).toBe("main");
		expect(workspace.repository_url).toBeNull();
		expect(await repositories.workspaces.list(Number.NaN)).toHaveLength(1);
		expect(await repositories.workspaces.list(999)).toHaveLength(1);
		expect(await repositories.workspaces.list(0)).toHaveLength(1);

		const user = await repositories.users.upsert({
			email: "minimal@example.com",
			id: "user_min",
		});
		expect(user.avatar_url).toBeNull();
		expect(user.display_name).toBeNull();

		const member = await repositories.workspaceMembers.upsert({
			id: "member_min",
			role: "observer",
			userId: user.id,
			workspaceId: workspace.id,
		});
		expect(member.invited_by).toBeNull();
		expect(member.joined_at).toBeNull();

		const machine = await repositories.machines.upsert({
			arch: "x64",
			bridgeVersion: "0.1.0",
			displayName: "Minimal machine",
			id: "machine_min",
			os: "linux",
			status: "offline",
			workspaceId: "ws_min",
		});
		expect(machine.last_seen_at).toBeNull();
		expect(machine.revoked_at).toBeNull();

		const agent = await repositories.agentInstallations.upsert({
			agentKind: "claude-code",
			authStatus: "unknown",
			capabilities: [],
			command: "claude",
			id: "agent_min",
			machineId: "machine_min",
		});
		expect(agent.version).toBeNull();

		const session = await repositories.sessions.create({
			createdBy: "user_01",
			id: "sess_min",
			parentSessionId: null,
			privacyMode: "local-only",
			title: "Minimal session",
			workspaceId: "ws_min",
		});
		expect(session.parent_session_id).toBeNull();
		expect(session.status).toBe("draft");

		const run = await repositories.runs.create({
			id: "run_min",
			sessionId: "sess_min",
			task: "Minimal run",
		});
		expect(run.agent_installation_id).toBeNull();
		expect(run.branch_name).toBeNull();
		expect(run.completed_at).toBeNull();
		expect(run.confidence).toBeNull();
		expect(run.cost_usd).toBeNull();
		expect(run.latency_ms).toBeNull();
		expect(run.machine_id).toBeNull();
		expect(run.queue_item_id).toBeNull();
		expect(run.scheduled_job_id).toBeNull();
		expect(run.started_at).toBeNull();
		expect(run.status).toBe("draft");
		expect(run.worktree_path_hash).toBeNull();
		expect(
			await repositories.runs.updateStatus({
				id: "run_min",
				status: "running",
			}),
		).toMatchObject({
			completed_at: null,
			confidence: null,
			cost_usd: null,
			latency_ms: null,
			started_at: null,
			status: "running",
		});

		const event: AgentDeckEvent = {
			createdAt: now,
			id: "evt_min",
			payload: { status: "running" },
			seq: 1,
			sessionId: "sess_min",
			source: "bridge",
			type: "session.started",
			visibility: "metadata",
			workspaceId: "ws_min",
		};
		const eventRow = await repositories.events.append({ event });
		expect(eventRow.object_key).toBeNull();
		expect(eventRow.payload_hash).toBeNull();
		expect(eventRow.run_id).toBeNull();
		expect(eventRow.trace_id).toBeNull();

		const approval = await repositories.approvals.create({
			decidedBy: null,
			decision: null,
			id: "approval_min",
			kind: "provider",
			requestedAction: { provider: "gateway" },
			risk: "low",
			runId: "run_min",
			sessionId: "sess_min",
			title: "Provider call",
			workspaceId: "ws_min",
		});
		expect(approval.decided_at).toBeNull();
		expect(approval.decided_by).toBeNull();
		expect(approval.decision_json).toBeNull();
		expect(approval.expires_at).toBeNull();
		expect(approval.status).toBe("pending");
		expect(await repositories.approvals.decide({ id: "approval_min", status: "expired" })).toMatchObject({
			decided_by: null,
			decision_json: null,
			status: "expired",
		});

		const queueItem = await repositories.queue.enqueue({
			createdBy: "user_01",
			id: "queue_min",
			priority: "low",
			task: "Minimal queue item",
			workspaceId: "ws_min",
		});
		expect(queueItem.agent_selector_json).toBeNull();
		expect(queueItem.machine_selector_json).toBeNull();
		expect(queueItem.max_cost_usd).toBeNull();
		expect(queueItem.max_runtime_minutes).toBeNull();
		expect(queueItem.run_after).toBeNull();
		expect(queueItem.schedule_window_json).toBeNull();
		expect(queueItem.status).toBe("queued");
		expect(await repositories.queue.cancel("queue_min", later)).toMatchObject({ cancelled_at: later, status: "cancelled" });

		const scheduledJob = await repositories.scheduledJobs.upsert({
			agentSelector: {},
			cron: "0 9 * * *",
			enabled: false,
			id: "schedule_min",
			machineSelector: {},
			name: "Disabled schedule",
			naturalLanguage: "Do not run yet",
			taskTemplate: "Wait",
			timezone: "UTC",
			workspaceId: "ws_min",
		});
		expect(scheduledJob.enabled).toBe(0);
		expect(scheduledJob.last_run_at).toBeNull();
		expect(scheduledJob.last_status).toBeNull();
		expect(scheduledJob.next_run_at).toBeNull();
		expect(await repositories.scheduledJobs.listDue(later)).toHaveLength(0);

		const artifact = await repositories.artifacts.create({
			id: "artifact_min",
			kind: "patch",
			mimeType: "text/plain",
			objectKey: "artifacts/min.patch",
			redactionStatus: "none",
			sessionId: "sess_min",
			sha256,
			sizeBytes: 0,
			workspaceId: "ws_min",
		});
		expect(artifact.run_id).toBeNull();

		const report = await repositories.decisionReports.create({
			confidence: 1,
			id: "report_min",
			recommendation: "accept",
			report: {},
			sessionId: "sess_min",
			summary: "Accepted",
			workspaceId: "ws_min",
		});
		expect(report.cost_usd).toBeNull();
		expect(report.latency_ms).toBeNull();
		expect(report.object_key).toBeNull();

		const rule = await repositories.policyRules.upsert({
			action: "Read files",
			defaultDecision: "allow",
			enabled: false,
			id: "policy_min",
			matcher: {},
			reason: "Read-only",
			risk: "low",
			workspaceId: "ws_min",
		});
		expect(rule.enabled).toBe(0);
		expect(await repositories.policyRules.listByWorkspace("ws_min")).toHaveLength(0);
		expect(await repositories.policyRules.listByWorkspace("ws_min", false)).toHaveLength(1);

		const auditEntry = await repositories.auditLog.create({
			action: "session.created",
			resourceType: "session",
			workspaceId: "ws_min",
		});
		expect(auditEntry.actor_id).toBeNull();
		expect(auditEntry.details_json).toBeNull();
		expect(auditEntry.ip_address).toBeNull();
		expect(auditEntry.resource_id).toBeNull();
		expect(auditEntry.user_agent).toBeNull();

		const metric = await repositories.metricSnapshots.create({
			metricName: "run_success_rate",
			metricValue: 1,
			periodEnd: later,
			periodStart: now,
			workspaceId: "ws_min",
		});
		expect(parseJsonColumn(metric.labels_json)).toEqual({});
		expect(await repositories.metricSnapshots.listByWorkspace("ws_min")).toHaveLength(1);

		const evalRun = await repositories.evalRuns.create({
			agentKind: "codex",
			datasetId: "minimal",
			workspaceId: "ws_min",
		});
		expect(evalRun.completed_at).toBeNull();
		expect(evalRun.model).toBeNull();
		expect(evalRun.results_json).toBeNull();
		expect(evalRun.score).toBeNull();
		expect(evalRun.status).toBe("queued");
		expect(await repositories.evalRuns.update({ id: evalRun.id })).toMatchObject({
			completed_at: null,
			results_json: null,
			score: null,
			status: "queued",
		});

		const retentionPolicy = await repositories.retentionPolicies.upsert({
			action: "delete",
			id: "retention_min",
			resourceType: "reports",
			retentionDays: 30,
			workspaceId: "ws_min",
		});
		expect(retentionPolicy.action).toBe("delete");
		expect(await repositories.retentionPolicies.listAll(0)).toHaveLength(1);
		expect(await repositories.retentionPolicies.listByWorkspace("ws_min", 0)).toHaveLength(1);
	});

	it("seeds a default workspace idempotently", async () => {
		const db = new MemoryD1();
		const repositories = createAgentDeckRepositories(db);

		await seedWorkspace(db, "ws_seed");
		await seedWorkspace(db, "ws_seed");

		expect(await repositories.workspaces.findById("ws_seed")).toMatchObject({ id: "ws_seed" });
		expect(await repositories.machines.listByWorkspace("ws_seed")).toHaveLength(1);
		expect(await repositories.policyRules.listByWorkspace("ws_seed", false)).toHaveLength(2);
	});

	it("rejects invalid repository input before preparing a D1 statement", () => {
		const repositories = createAgentDeckRepositories(new MemoryD1());

		expect(() =>
			repositories.sessions.create({
				createdBy: "user_01",
				id: "sess_01",
				privacyMode: "metadata-only",
				title: " ",
				workspaceId: "ws_01",
			}),
		).toThrow();
	});

	it("wraps unsuccessful D1 writes", async () => {
		const repositories = createAgentDeckRepositories(new FailedRunD1());

		await expect(
			repositories.workspaces.create({
				id: "ws_01",
				name: "AgentDeck",
				privacyMode: "metadata-only",
			}),
		).rejects.toThrow(AgentDeckDatabaseError);
	});

	it("wraps thrown D1 writes", async () => {
		const repositories = createAgentDeckRepositories(new ThrowRunD1());

		await expect(
			repositories.workspaces.create({
				id: "ws_01",
				name: "AgentDeck",
				privacyMode: "metadata-only",
			}),
		).rejects.toThrow(AgentDeckDatabaseError);
	});

	it("wraps D1 read and list failures", async () => {
		await expect(createAgentDeckRepositories(new ThrowFirstD1()).workspaces.findById("ws_01")).rejects.toThrow(
			AgentDeckDatabaseError,
		);
		await expect(createAgentDeckRepositories(new ThrowAllD1()).workspaces.list()).rejects.toThrow(AgentDeckDatabaseError);
	});

	it("fails if D1 does not return a row after a successful write", async () => {
		const repositories = createAgentDeckRepositories(new MissingRowAfterWriteD1());

		await expect(
			repositories.workspaces.create({
				id: "ws_01",
				name: "AgentDeck",
				privacyMode: "metadata-only",
			}),
		).rejects.toThrow(AgentDeckDatabaseError);
	});

	it("converts SQLite booleans and JSON columns", () => {
		expect(toSqlBoolean(true)).toBe(1);
		expect(toSqlBoolean(false)).toBe(0);
		expect(fromSqlBoolean(1)).toBe(true);
		expect(fromSqlBoolean(0)).toBe(false);
		expect(parseJsonColumn<{ key: string }>('{"key":"value"}')).toEqual({ key: "value" });
		expect(parseNullableJsonColumn<{ key: string }>(null)).toBeNull();
		expect(parseNullableJsonColumn<{ key: string }>('{"key":"value"}')).toEqual({ key: "value" });
	});
});

function normalizeSql(sql: string): string {
	return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function isTableName(value: string): value is TableName {
	return tableNames.includes(value as TableName);
}

function limitRows(rows: Row[], rawLimit: unknown): Row[] {
	const limit = Number.isFinite(Number(rawLimit)) ? Number(rawLimit) : 50;
	return rows.slice(0, Math.max(1, Math.trunc(limit)));
}
