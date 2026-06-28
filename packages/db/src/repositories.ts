import type {
	AgentInstallationRow,
	ApprovalRow,
	ArtifactRow,
	CreateApprovalInput,
	CreateArtifactInput,
	CreateDecisionReportInput,
	CreateQueueItemInput,
	CreateRunInput,
	CreateSessionInput,
	CreateWorkspaceInput,
	DecisionReportRow,
	DecideApprovalInput,
	EventIndexRow,
	JsonValue,
	MachineRow,
	PersistEventInput,
	PolicyRuleRow,
	QueueItemRow,
	RunRow,
	ScheduledJobRow,
	SessionRow,
	SqliteBoolean,
	UpdateRunStatusInput,
	UpsertAgentInstallationInput,
	UpsertMachineInput,
	UpsertPolicyRuleInput,
	UpsertScheduledJobInput,
	WorkspaceRow,
} from "./types/openfusion-db";
import type { ApprovalStatus, RunStatus } from "@openfusion/core";
import {
	createApprovalInputSchema,
	createArtifactInputSchema,
	createDecisionReportInputSchema,
	createQueueItemInputSchema,
	createRunInputSchema,
	createSessionInputSchema,
	createWorkspaceInputSchema,
	decideApprovalInputSchema,
	parsePersistEventInput,
	updateRunStatusInputSchema,
	upsertAgentInstallationInputSchema,
	upsertMachineInputSchema,
	upsertPolicyRuleInputSchema,
	upsertScheduledJobInputSchema,
} from "./validators";

type BindValue = string | number | null;
export type QueryableD1 = Pick<D1Database, "prepare">;

export class OpenFusionDatabaseError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = "OpenFusionDatabaseError";
	}
}

export type OpenFusionRepositories = ReturnType<typeof createOpenFusionRepositories>;

export function toSqlBoolean(value: boolean): SqliteBoolean {
	return value ? 1 : 0;
}

export function fromSqlBoolean(value: number): boolean {
	return value === 1;
}

export function parseJsonColumn<T extends JsonValue>(value: string): T {
	return JSON.parse(value) as T;
}

export function parseNullableJsonColumn<T extends JsonValue>(value: string | null): T | null {
	return value === null ? null : parseJsonColumn<T>(value);
}

export function createOpenFusionRepositories(db: QueryableD1) {
	return {
		workspaces: {
			create: (input: CreateWorkspaceInput) => createWorkspace(db, createWorkspaceInputSchema.parse(input)),
			findById: (id: string) => firstRow<WorkspaceRow>(db, "SELECT * FROM workspaces WHERE id = ?", [id]),
			list: (limit?: number) =>
				allRows<WorkspaceRow>(db, "SELECT * FROM workspaces ORDER BY updated_at DESC LIMIT ?", [normalizeLimit(limit)]),
		},
		machines: {
			upsert: (input: UpsertMachineInput) => upsertMachine(db, upsertMachineInputSchema.parse(input)),
			findById: (id: string) => firstRow<MachineRow>(db, "SELECT * FROM machines WHERE id = ?", [id]),
			listByWorkspace: (workspaceId: string, status?: MachineRow["status"], limit?: number) =>
				status
					? allRows<MachineRow>(
							db,
							"SELECT * FROM machines WHERE workspace_id = ? AND status = ? ORDER BY updated_at DESC LIMIT ?",
							[workspaceId, status, normalizeLimit(limit)],
						)
					: allRows<MachineRow>(db, "SELECT * FROM machines WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT ?", [
							workspaceId,
							normalizeLimit(limit),
						]),
		},
		agentInstallations: {
			upsert: (input: UpsertAgentInstallationInput) =>
				upsertAgentInstallation(db, upsertAgentInstallationInputSchema.parse(input)),
			findById: (id: string) => firstRow<AgentInstallationRow>(db, "SELECT * FROM agent_installations WHERE id = ?", [id]),
			listByMachine: (machineId: string) =>
				allRows<AgentInstallationRow>(db, "SELECT * FROM agent_installations WHERE machine_id = ? ORDER BY agent_kind ASC", [
					machineId,
				]),
		},
		sessions: {
			create: (input: CreateSessionInput) => createSession(db, createSessionInputSchema.parse(input)),
			findById: (id: string) => firstRow<SessionRow>(db, "SELECT * FROM sessions WHERE id = ?", [id]),
			listByWorkspace: (workspaceId: string, status?: RunStatus, limit?: number) =>
				status
					? allRows<SessionRow>(
							db,
							"SELECT * FROM sessions WHERE workspace_id = ? AND status = ? ORDER BY updated_at DESC LIMIT ?",
							[workspaceId, status, normalizeLimit(limit)],
						)
					: allRows<SessionRow>(db, "SELECT * FROM sessions WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT ?", [
							workspaceId,
							normalizeLimit(limit),
						]),
			updateStatus: (id: string, status: RunStatus, updatedAt = nowIso()) =>
				updateSessionStatus(db, id, status, updatedAt),
		},
		runs: {
			create: (input: CreateRunInput) => createRun(db, createRunInputSchema.parse(input)),
			findById: (id: string) => firstRow<RunRow>(db, "SELECT * FROM runs WHERE id = ?", [id]),
			listBySession: (sessionId: string, limit?: number) =>
				allRows<RunRow>(db, "SELECT * FROM runs WHERE session_id = ? ORDER BY created_at DESC LIMIT ?", [
					sessionId,
					normalizeLimit(limit),
				]),
			updateStatus: (input: UpdateRunStatusInput) => updateRunStatus(db, updateRunStatusInputSchema.parse(input)),
		},
		events: {
			append: (input: PersistEventInput) => appendEvent(db, parsePersistEventInput(input)),
			listBySession: (sessionId: string, afterSeq = -1, limit?: number) =>
				allRows<EventIndexRow>(
					db,
					"SELECT * FROM event_index WHERE session_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?",
					[sessionId, afterSeq, normalizeLimit(limit, 500)],
				),
		},
		approvals: {
			create: (input: CreateApprovalInput) => createApproval(db, createApprovalInputSchema.parse(input)),
			findById: (id: string) => firstRow<ApprovalRow>(db, "SELECT * FROM approvals WHERE id = ?", [id]),
			listByWorkspace: (workspaceId: string, status?: ApprovalStatus, limit?: number) =>
				status
					? allRows<ApprovalRow>(
							db,
							"SELECT * FROM approvals WHERE workspace_id = ? AND status = ? ORDER BY created_at DESC LIMIT ?",
							[workspaceId, status, normalizeLimit(limit)],
						)
					: allRows<ApprovalRow>(db, "SELECT * FROM approvals WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?", [
							workspaceId,
							normalizeLimit(limit),
						]),
			decide: (input: DecideApprovalInput) => decideApproval(db, decideApprovalInputSchema.parse(input)),
		},
		queue: {
			enqueue: (input: CreateQueueItemInput) => createQueueItem(db, createQueueItemInputSchema.parse(input)),
			findById: (id: string) => firstRow<QueueItemRow>(db, "SELECT * FROM queue_items WHERE id = ?", [id]),
			listByWorkspace: (workspaceId: string, status?: RunStatus, limit?: number) =>
				status
					? allRows<QueueItemRow>(
							db,
							"SELECT * FROM queue_items WHERE workspace_id = ? AND status = ? ORDER BY priority DESC, run_after ASC, created_at ASC LIMIT ?",
							[workspaceId, status, normalizeLimit(limit)],
						)
					: allRows<QueueItemRow>(
							db,
							"SELECT * FROM queue_items WHERE workspace_id = ? ORDER BY priority DESC, run_after ASC, created_at ASC LIMIT ?",
							[workspaceId, normalizeLimit(limit)],
						),
		},
		scheduledJobs: {
			upsert: (input: UpsertScheduledJobInput) => upsertScheduledJob(db, upsertScheduledJobInputSchema.parse(input)),
			findById: (id: string) => firstRow<ScheduledJobRow>(db, "SELECT * FROM scheduled_jobs WHERE id = ?", [id]),
			listDue: (now: string, limit?: number) =>
				allRows<ScheduledJobRow>(
					db,
					"SELECT * FROM scheduled_jobs WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT ?",
					[now, normalizeLimit(limit)],
				),
		},
		artifacts: {
			create: (input: CreateArtifactInput) => createArtifact(db, createArtifactInputSchema.parse(input)),
			findById: (id: string) => firstRow<ArtifactRow>(db, "SELECT * FROM artifacts WHERE id = ?", [id]),
			listBySession: (sessionId: string, limit?: number) =>
				allRows<ArtifactRow>(db, "SELECT * FROM artifacts WHERE session_id = ? ORDER BY created_at DESC LIMIT ?", [
					sessionId,
					normalizeLimit(limit),
				]),
		},
		decisionReports: {
			create: (input: CreateDecisionReportInput) =>
				createDecisionReport(db, createDecisionReportInputSchema.parse(input)),
			findById: (id: string) => firstRow<DecisionReportRow>(db, "SELECT * FROM decision_reports WHERE id = ?", [id]),
			listByWorkspace: (workspaceId: string, limit?: number) =>
				allRows<DecisionReportRow>(
					db,
					"SELECT * FROM decision_reports WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?",
					[workspaceId, normalizeLimit(limit)],
				),
		},
		policyRules: {
			upsert: (input: UpsertPolicyRuleInput) => upsertPolicyRule(db, upsertPolicyRuleInputSchema.parse(input)),
			listByWorkspace: (workspaceId: string, enabledOnly = true) =>
				enabledOnly
					? allRows<PolicyRuleRow>(
							db,
							"SELECT * FROM policy_rules WHERE workspace_id = ? AND enabled = 1 ORDER BY action ASC",
							[workspaceId],
						)
					: allRows<PolicyRuleRow>(db, "SELECT * FROM policy_rules WHERE workspace_id = ? ORDER BY action ASC", [
							workspaceId,
						]),
		},
	};
}

async function createWorkspace(db: QueryableD1, input: CreateWorkspaceInput): Promise<WorkspaceRow> {
	const createdAt = input.createdAt ?? nowIso();
	const updatedAt = input.updatedAt ?? createdAt;
	await runStatement(
		db,
		`INSERT INTO workspaces (id, name, repository_url, default_branch, privacy_mode, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		[
			input.id,
			input.name,
			input.repositoryUrl ?? null,
			input.defaultBranch ?? "main",
			input.privacyMode,
			createdAt,
			updatedAt,
		],
	);
	return requireRow(await firstRow<WorkspaceRow>(db, "SELECT * FROM workspaces WHERE id = ?", [input.id]), "Workspace");
}

async function upsertMachine(db: QueryableD1, input: UpsertMachineInput): Promise<MachineRow> {
	const createdAt = input.createdAt ?? nowIso();
	const updatedAt = input.updatedAt ?? createdAt;
	await runStatement(
		db,
		`INSERT INTO machines (
			id, workspace_id, display_name, os, arch, bridge_version, status,
			last_seen_at, revoked_at, created_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			display_name = excluded.display_name,
			os = excluded.os,
			arch = excluded.arch,
			bridge_version = excluded.bridge_version,
			status = excluded.status,
			last_seen_at = excluded.last_seen_at,
			revoked_at = excluded.revoked_at,
			updated_at = excluded.updated_at`,
		[
			input.id,
			input.workspaceId,
			input.displayName,
			input.os,
			input.arch,
			input.bridgeVersion,
			input.status,
			input.lastSeenAt ?? null,
			input.revokedAt ?? null,
			createdAt,
			updatedAt,
		],
	);
	return requireRow(await firstRow<MachineRow>(db, "SELECT * FROM machines WHERE id = ?", [input.id]), "Machine");
}

async function upsertAgentInstallation(
	db: QueryableD1,
	input: UpsertAgentInstallationInput,
): Promise<AgentInstallationRow> {
	const detectedAt = input.detectedAt ?? nowIso();
	const updatedAt = input.updatedAt ?? detectedAt;
	await runStatement(
		db,
		`INSERT INTO agent_installations (
			id, machine_id, agent_kind, command, version, auth_status, capabilities_json, detected_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(machine_id, agent_kind, command) DO UPDATE SET
			version = excluded.version,
			auth_status = excluded.auth_status,
			capabilities_json = excluded.capabilities_json,
			detected_at = excluded.detected_at,
			updated_at = excluded.updated_at`,
		[
			input.id,
			input.machineId,
			input.agentKind,
			input.command,
			input.version ?? null,
			input.authStatus,
			encodeRequiredJson(input.capabilities),
			detectedAt,
			updatedAt,
		],
	);
	return requireRow(
		await firstRow<AgentInstallationRow>(
			db,
			"SELECT * FROM agent_installations WHERE machine_id = ? AND agent_kind = ? AND command = ?",
			[input.machineId, input.agentKind, input.command],
		),
		"Agent installation",
	);
}

async function createSession(db: QueryableD1, input: CreateSessionInput): Promise<SessionRow> {
	const createdAt = input.createdAt ?? nowIso();
	const updatedAt = input.updatedAt ?? createdAt;
	await runStatement(
		db,
		`INSERT INTO sessions (
			id, workspace_id, parent_session_id, title, status, privacy_mode, created_by, created_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			input.id,
			input.workspaceId,
			input.parentSessionId ?? null,
			input.title,
			input.status ?? "draft",
			input.privacyMode,
			input.createdBy,
			createdAt,
			updatedAt,
		],
	);
	return requireRow(await firstRow<SessionRow>(db, "SELECT * FROM sessions WHERE id = ?", [input.id]), "Session");
}

async function updateSessionStatus(
	db: QueryableD1,
	id: string,
	status: RunStatus,
	updatedAt: string,
): Promise<SessionRow | null> {
	await runStatement(db, "UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?", [status, updatedAt, id]);
	return firstRow<SessionRow>(db, "SELECT * FROM sessions WHERE id = ?", [id]);
}

async function createRun(db: QueryableD1, input: CreateRunInput): Promise<RunRow> {
	const createdAt = input.createdAt ?? nowIso();
	const updatedAt = input.updatedAt ?? createdAt;
	await runStatement(
		db,
		`INSERT INTO runs (
			id, session_id, queue_item_id, scheduled_job_id, machine_id, agent_installation_id,
			task, worktree_path_hash, branch_name, status, cost_usd, latency_ms, confidence,
			started_at, completed_at, created_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			input.id,
			input.sessionId,
			input.queueItemId ?? null,
			input.scheduledJobId ?? null,
			input.machineId ?? null,
			input.agentInstallationId ?? null,
			input.task,
			input.worktreePathHash ?? null,
			input.branchName ?? null,
			input.status ?? "draft",
			input.costUsd ?? null,
			input.latencyMs ?? null,
			input.confidence ?? null,
			input.startedAt ?? null,
			input.completedAt ?? null,
			createdAt,
			updatedAt,
		],
	);
	return requireRow(await firstRow<RunRow>(db, "SELECT * FROM runs WHERE id = ?", [input.id]), "Run");
}

async function updateRunStatus(db: QueryableD1, input: UpdateRunStatusInput): Promise<RunRow | null> {
	const existing = await firstRow<RunRow>(db, "SELECT * FROM runs WHERE id = ?", [input.id]);
	if (!existing) {
		return null;
	}

	await runStatement(
		db,
		`UPDATE runs SET
			status = ?,
			cost_usd = ?,
			latency_ms = ?,
			confidence = ?,
			started_at = ?,
			completed_at = ?,
			updated_at = ?
		WHERE id = ?`,
		[
			input.status,
			input.costUsd === undefined ? existing.cost_usd : input.costUsd,
			input.latencyMs === undefined ? existing.latency_ms : input.latencyMs,
			input.confidence === undefined ? existing.confidence : input.confidence,
			input.startedAt === undefined ? existing.started_at : input.startedAt,
			input.completedAt === undefined ? existing.completed_at : input.completedAt,
			input.updatedAt ?? nowIso(),
			input.id,
		],
	);
	return firstRow<RunRow>(db, "SELECT * FROM runs WHERE id = ?", [input.id]);
}

async function appendEvent(db: QueryableD1, input: PersistEventInput): Promise<EventIndexRow> {
	await runStatement(
		db,
		`INSERT INTO event_index (
			id, workspace_id, session_id, run_id, seq, type, source, visibility,
			object_key, payload_hash, trace_id, created_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			input.event.id,
			input.event.workspaceId,
			input.event.sessionId,
			input.event.runId ?? null,
			input.event.seq,
			input.event.type,
			input.event.source,
			input.event.visibility,
			input.objectKey ?? null,
			input.event.hash ?? null,
			input.event.traceId ?? null,
			input.event.createdAt,
		],
	);
	return requireRow(await firstRow<EventIndexRow>(db, "SELECT * FROM event_index WHERE id = ?", [input.event.id]), "Event");
}

async function createApproval(db: QueryableD1, input: CreateApprovalInput): Promise<ApprovalRow> {
	const createdAt = input.createdAt ?? nowIso();
	await runStatement(
		db,
		`INSERT INTO approvals (
			id, workspace_id, session_id, run_id, kind, title, risk, status,
			requested_action_json, decision_json, decided_by, expires_at, created_at, decided_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			input.id,
			input.workspaceId,
			input.sessionId,
			input.runId,
			input.kind,
			input.title,
			input.risk,
			input.status ?? "pending",
			encodeRequiredJson(input.requestedAction),
			encodeOptionalJson(input.decision),
			input.decidedBy ?? null,
			input.expiresAt ?? null,
			createdAt,
			input.decidedAt ?? null,
		],
	);
	return requireRow(await firstRow<ApprovalRow>(db, "SELECT * FROM approvals WHERE id = ?", [input.id]), "Approval");
}

async function decideApproval(db: QueryableD1, input: DecideApprovalInput): Promise<ApprovalRow | null> {
	await runStatement(
		db,
		`UPDATE approvals SET
			status = ?,
			decision_json = ?,
			decided_by = ?,
			decided_at = ?
		WHERE id = ?`,
		[
			input.status,
			encodeOptionalJson(input.decision),
			input.decidedBy ?? null,
			input.decidedAt ?? nowIso(),
			input.id,
		],
	);
	return firstRow<ApprovalRow>(db, "SELECT * FROM approvals WHERE id = ?", [input.id]);
}

async function createQueueItem(db: QueryableD1, input: CreateQueueItemInput): Promise<QueueItemRow> {
	const createdAt = input.createdAt ?? nowIso();
	const updatedAt = input.updatedAt ?? createdAt;
	await runStatement(
		db,
		`INSERT INTO queue_items (
			id, workspace_id, created_by, task, priority, status, run_after,
			schedule_window_json, agent_selector_json, machine_selector_json,
			max_cost_usd, max_runtime_minutes, created_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			input.id,
			input.workspaceId,
			input.createdBy,
			input.task,
			input.priority,
			input.status ?? "queued",
			input.runAfter ?? null,
			encodeOptionalJson(input.scheduleWindow),
			encodeOptionalJson(input.agentSelector),
			encodeOptionalJson(input.machineSelector),
			input.maxCostUsd ?? null,
			input.maxRuntimeMinutes ?? null,
			createdAt,
			updatedAt,
		],
	);
	return requireRow(await firstRow<QueueItemRow>(db, "SELECT * FROM queue_items WHERE id = ?", [input.id]), "Queue item");
}

async function upsertScheduledJob(db: QueryableD1, input: UpsertScheduledJobInput): Promise<ScheduledJobRow> {
	const createdAt = input.createdAt ?? nowIso();
	const updatedAt = input.updatedAt ?? createdAt;
	await runStatement(
		db,
		`INSERT INTO scheduled_jobs (
			id, workspace_id, name, natural_language, cron, timezone, enabled,
			task_template, agent_selector_json, machine_selector_json, next_run_at,
			last_run_at, last_status, created_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			natural_language = excluded.natural_language,
			cron = excluded.cron,
			timezone = excluded.timezone,
			enabled = excluded.enabled,
			task_template = excluded.task_template,
			agent_selector_json = excluded.agent_selector_json,
			machine_selector_json = excluded.machine_selector_json,
			next_run_at = excluded.next_run_at,
			last_run_at = excluded.last_run_at,
			last_status = excluded.last_status,
			updated_at = excluded.updated_at`,
		[
			input.id,
			input.workspaceId,
			input.name,
			input.naturalLanguage,
			input.cron,
			input.timezone,
			toSqlBoolean(input.enabled),
			input.taskTemplate,
			encodeRequiredJson(input.agentSelector),
			encodeRequiredJson(input.machineSelector),
			input.nextRunAt ?? null,
			input.lastRunAt ?? null,
			input.lastStatus ?? null,
			createdAt,
			updatedAt,
		],
	);
	return requireRow(await firstRow<ScheduledJobRow>(db, "SELECT * FROM scheduled_jobs WHERE id = ?", [input.id]), "Scheduled job");
}

async function createArtifact(db: QueryableD1, input: CreateArtifactInput): Promise<ArtifactRow> {
	await runStatement(
		db,
		`INSERT INTO artifacts (
			id, workspace_id, session_id, run_id, kind, object_key,
			mime_type, size_bytes, sha256, redaction_status, created_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			input.id,
			input.workspaceId,
			input.sessionId,
			input.runId ?? null,
			input.kind,
			input.objectKey,
			input.mimeType,
			input.sizeBytes,
			input.sha256,
			input.redactionStatus,
			input.createdAt ?? nowIso(),
		],
	);
	return requireRow(await firstRow<ArtifactRow>(db, "SELECT * FROM artifacts WHERE id = ?", [input.id]), "Artifact");
}

async function createDecisionReport(db: QueryableD1, input: CreateDecisionReportInput): Promise<DecisionReportRow> {
	await runStatement(
		db,
		`INSERT INTO decision_reports (
			id, workspace_id, session_id, summary, recommendation, confidence,
			cost_usd, latency_ms, report_json, object_key, created_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			input.id,
			input.workspaceId,
			input.sessionId,
			input.summary,
			input.recommendation,
			input.confidence,
			input.costUsd ?? null,
			input.latencyMs ?? null,
			encodeRequiredJson(input.report),
			input.objectKey ?? null,
			input.createdAt ?? nowIso(),
		],
	);
	return requireRow(
		await firstRow<DecisionReportRow>(db, "SELECT * FROM decision_reports WHERE id = ?", [input.id]),
		"Decision report",
	);
}

async function upsertPolicyRule(db: QueryableD1, input: UpsertPolicyRuleInput): Promise<PolicyRuleRow> {
	const createdAt = input.createdAt ?? nowIso();
	const updatedAt = input.updatedAt ?? createdAt;
	await runStatement(
		db,
		`INSERT INTO policy_rules (
			id, workspace_id, action, default_decision, risk, reason, matcher_json,
			enabled, created_at, updated_at
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			action = excluded.action,
			default_decision = excluded.default_decision,
			risk = excluded.risk,
			reason = excluded.reason,
			matcher_json = excluded.matcher_json,
			enabled = excluded.enabled,
			updated_at = excluded.updated_at`,
		[
			input.id,
			input.workspaceId,
			input.action,
			input.defaultDecision,
			input.risk,
			input.reason,
			encodeRequiredJson(input.matcher),
			toSqlBoolean(input.enabled),
			createdAt,
			updatedAt,
		],
	);
	return requireRow(await firstRow<PolicyRuleRow>(db, "SELECT * FROM policy_rules WHERE id = ?", [input.id]), "Policy rule");
}

async function runStatement(db: QueryableD1, sql: string, values: BindValue[]): Promise<void> {
	try {
		const result = await db.prepare(sql).bind(...values).run();
		if (!result.success) {
			throw new OpenFusionDatabaseError("D1 statement failed");
		}
	} catch (cause) {
		if (cause instanceof OpenFusionDatabaseError) {
			throw cause;
		}
		throw new OpenFusionDatabaseError("D1 statement failed", { cause });
	}
}

async function firstRow<T>(db: QueryableD1, sql: string, values: BindValue[]): Promise<T | null> {
	try {
		return await db.prepare(sql).bind(...values).first<T>();
	} catch (cause) {
		throw new OpenFusionDatabaseError("D1 read failed", { cause });
	}
}

async function allRows<T>(db: QueryableD1, sql: string, values: BindValue[]): Promise<T[]> {
	try {
		const result = await db.prepare(sql).bind(...values).all<T>();
		return result.results;
	} catch (cause) {
		throw new OpenFusionDatabaseError("D1 list query failed", { cause });
	}
}

function requireRow<T>(row: T | null, label: string): T {
	if (!row) {
		throw new OpenFusionDatabaseError(`${label} was not found after write`);
	}
	return row;
}

function encodeRequiredJson(value: JsonValue): string {
	return JSON.stringify(value);
}

function encodeOptionalJson(value: JsonValue | null | undefined): string | null {
	return value === undefined || value === null ? null : JSON.stringify(value);
}

function normalizeLimit(limit = 50, max = 200): number {
	if (!Number.isFinite(limit)) {
		return 50;
	}
	return Math.max(1, Math.min(max, Math.trunc(limit)));
}

function nowIso(): string {
	return new Date().toISOString();
}
