"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
	ActiveRun,
	AgentGraphNode,
	AgentInstallation,
	ApprovalRequest,
	AuditTrailEntry,
	DecisionReport,
	EvalRunSummary,
	ObservabilityMetric,
	PolicyRule,
	QueueItem,
	RetentionPolicy,
	RunStatus,
	ScheduledJob,
	TerminalLine,
	TerminalTab,
	TimelineEvent,
	VerificationResult,
	WorkspaceMember,
	WorkspaceSummary,
} from "@agentdeck/core";
import { classifyCommandRisk } from "@agentdeck/policy";
import type {
	AgentInstallationRow,
	ApprovalRow,
	AuditLogRow,
	DecisionReportRow,
	EvalRunRow,
	JsonValue,
	MachineRow,
	MetricSnapshotRow,
	PolicyRuleRow,
	QueueItemRow,
	RetentionPolicyRow,
	RunRow,
	ScheduledJobRow,
	SessionRow,
	UserRow,
	WorkspaceMemberRow,
	WorkspaceRow,
} from "@agentdeck/db";
import { getAgentDeckDataMode } from "@/lib/data-mode";
import {
	activeRun,
	agentInstallations,
	auditTrail,
	decisionReport,
	evalRuns,
	observabilityMetrics,
	policyRules,
	queueItems,
	retentionPolicies,
	scheduledJobs,
	workspaceMembers,
	workspaceSummary,
} from "@/lib/mock-agentdeck";

export class AgentDeckApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly issues?: unknown,
	) {
		super(message);
		this.name = "AgentDeckApiError";
	}
}

type CurrentWorkspaceResponse = {
	costTodayUsd: number;
	machineCount: number;
	pendingApprovals: number;
	user: { role: string; userId: string; workspaceId: string };
	workspace: WorkspaceRow;
};

export type MachineWithAgents = MachineRow & {
	agents: AgentInstallationRow[];
};

export type SessionDetail = {
	approvals: ApprovalRow[];
	artifacts: Array<{ id: string; kind: string; run_id: string | null }>;
	queueItem: QueueItemRow | null;
	reports: DecisionReportRow[];
	runs: RunRow[];
	session: SessionRow;
};

export type MachinePairingInput = {
	displayName?: string;
};

export type NewTaskInput = {
	agentKind: "auto" | AgentInstallation["kind"];
	maxCostUsd?: number | null;
	maxRuntimeMinutes?: number | null;
	priority: QueueItem["priority"];
	privacyMode: WorkspaceSummary["privacyMode"];
	repositoryPath: string;
	task: string;
	verification: {
		build: boolean;
		lint: boolean;
		test: boolean;
		typecheck: boolean;
	};
};

export type SetupWorkspaceInput = {
	defaultBranch?: string;
	name: string;
	privacyMode: WorkspaceSummary["privacyMode"];
	repositoryUrl?: string | null;
};

async function readApiJson<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		...init,
		headers: {
			Accept: "application/json",
			...(init?.body ? { "Content-Type": "application/json" } : {}),
			...init?.headers,
		},
	});
	const body = await response.json().catch(() => null);

	if (!response.ok) {
		const record = isRecord(body) ? body : {};
		throw new AgentDeckApiError(
			response.status,
			typeof record.code === "string" ? record.code : "INTERNAL_ERROR",
			typeof record.error === "string" ? record.error : `${init?.method ?? "GET"} ${path} failed with ${response.status}`,
			record.issues,
		);
	}

	return body as T;
}

function mockQuery<T>(value: T): () => Promise<T> {
	return async () => value;
}

function queryOptions<T>(liveFn: () => Promise<T>, mockValue: T) {
	const mode = getAgentDeckDataMode();
	return {
		initialData: mode === "mock" ? mockValue : undefined,
		queryFn: mode === "mock" ? mockQuery(mockValue) : liveFn,
		retry: mode === "mock" ? false : 1,
	};
}

export function useActiveRun() {
	return useQuery<ActiveRun | null>({
		...queryOptions(readLatestActiveRun, activeRun),
		queryKey: ["active-run", getAgentDeckDataMode()],
	});
}

export function useSessionDetail(sessionId: string | null) {
	const mode = getAgentDeckDataMode();
	return useQuery<ActiveRun | null>({
		enabled: mode === "mock" || Boolean(sessionId),
		initialData: mode === "mock" ? activeRun : undefined,
		queryFn: mode === "mock" ? mockQuery(activeRun) : () => readActiveRunBySession(sessionId ?? ""),
		queryKey: ["session-detail", mode, sessionId],
		retry: mode === "mock" ? false : 1,
	});
}

export function useAgentInventory() {
	return useQuery<AgentInstallation[]>({
		...queryOptions(async () => mapAgentInventory(await readMachines()), agentInstallations),
		queryKey: ["agents", getAgentDeckDataMode()],
	});
}

export function useMachines() {
	return useQuery<MachineWithAgents[]>({
		...queryOptions(readMachines, []),
		queryKey: ["machines", getAgentDeckDataMode()],
	});
}

export function useDecisionReports() {
	return useQuery<DecisionReport[]>({
		...queryOptions(async () => mapReports((await readApiJson<{ reports: DecisionReportRow[] }>("/api/reports")).reports), [
			decisionReport,
		]),
		queryKey: ["reports", getAgentDeckDataMode()],
	});
}

export function usePolicies() {
	return useQuery<PolicyRule[]>({
		...queryOptions(async () => mapPolicies((await readApiJson<{ policies: PolicyRuleRow[] }>("/api/policies")).policies), policyRules),
		queryKey: ["policies", getAgentDeckDataMode()],
	});
}

export function useQueueItems() {
	return useQuery<QueueItem[]>({
		...queryOptions(async () => mapQueueItems((await readApiJson<{ queueItems: QueueItemRow[] }>("/api/queue")).queueItems), queueItems),
		queryKey: ["queue", getAgentDeckDataMode()],
	});
}

export function useScheduledJobs() {
	return useQuery<ScheduledJob[]>({
		...queryOptions(async () => mapSchedules((await readApiJson<{ schedules: ScheduledJobRow[] }>("/api/schedules")).schedules), scheduledJobs),
		queryKey: ["schedules", getAgentDeckDataMode()],
	});
}

export function useWorkspaceSummary() {
	return useQuery<WorkspaceSummary>({
		...queryOptions(async () => mapWorkspaceSummary(await readApiJson<CurrentWorkspaceResponse>("/api/workspaces/current")), workspaceSummary),
		queryKey: ["workspace", getAgentDeckDataMode()],
	});
}

export function useObservabilityMetrics() {
	return useQuery<ObservabilityMetric[]>({
		...queryOptions(
			async () => mapMetrics((await readApiJson<{ metricSnapshots: MetricSnapshotRow[] }>("/api/metrics")).metricSnapshots),
			observabilityMetrics,
		),
		queryKey: ["observability-metrics", getAgentDeckDataMode()],
	});
}

export function useAuditTrail() {
	return useQuery<AuditTrailEntry[]>({
		...queryOptions(async () => mapAudit((await readApiJson<{ auditEntries: AuditLogRow[] }>("/api/audit")).auditEntries), auditTrail),
		queryKey: ["audit-trail", getAgentDeckDataMode()],
	});
}

export function useEvalRuns() {
	return useQuery<EvalRunSummary[]>({
		...queryOptions(async () => mapEvalRuns((await readApiJson<{ evalRuns: EvalRunRow[] }>("/api/evals")).evalRuns), evalRuns),
		queryKey: ["eval-runs", getAgentDeckDataMode()],
	});
}

export function useWorkspaceMembers() {
	return useQuery<WorkspaceMember[]>({
		...queryOptions(async () => mapMembers(await readMembers()), workspaceMembers),
		queryKey: ["workspace-members", getAgentDeckDataMode()],
	});
}

export function useRetentionPolicies() {
	return useQuery<RetentionPolicy[]>({
		...queryOptions(
			async () => mapRetention((await readApiJson<{ retentionPolicies: RetentionPolicyRow[] }>("/api/retention")).retentionPolicies),
			retentionPolicies,
		),
		queryKey: ["retention-policies", getAgentDeckDataMode()],
	});
}

export function useApprovals() {
	return useQuery<ApprovalRequest[]>({
		...queryOptions(
			async () => mapApprovals((await readApiJson<{ approvals: ApprovalRow[] }>("/api/approvals?status=pending")).approvals),
			activeRun.approvals,
		),
		queryKey: ["approvals", getAgentDeckDataMode()],
	});
}

export function useCreateWorkspace() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: SetupWorkspaceInput) =>
			readApiJson("/api/workspaces", {
				body: JSON.stringify(input),
				method: "POST",
			}),
		onSuccess: async () => {
			await queryClient.invalidateQueries();
		},
	});
}

export function useCreateTask() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: NewTaskInput) => {
			const sessionResponse = await readApiJson<{ session: SessionRow }>("/api/sessions", {
				body: JSON.stringify({
					privacyMode: input.privacyMode,
					title: input.task.slice(0, 120),
				}),
				method: "POST",
			});
			const agentSelector =
				input.agentKind === "auto"
					? { strategy: "frontier-fallback", verification: input.verification }
					: { kind: input.agentKind, strategy: "single", verification: input.verification };
			const queueResponse = await readApiJson<{ queueItem: QueueItemRow }>("/api/queue", {
				body: JSON.stringify({
					agentSelector,
					machineSelector: { repoPath: input.repositoryPath },
					maxCostUsd: input.maxCostUsd,
					maxRuntimeMinutes: input.maxRuntimeMinutes,
					priority: input.priority,
					scheduleWindow: { mode: "queue-now" },
					sessionId: sessionResponse.session.id,
					task: input.task,
				}),
				method: "POST",
			});

			return {
				queueItem: queueResponse.queueItem,
				session: sessionResponse.session,
			};
		},
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["active-run"] }),
				queryClient.invalidateQueries({ queryKey: ["queue"] }),
				queryClient.invalidateQueries({ queryKey: ["workspace"] }),
			]);
		},
	});
}

export function useCreatePairingCode() {
	return useMutation({
		mutationFn: () =>
			readApiJson<{ expiresInSeconds: number; pairingCode: string }>("/api/machines/pairing-code", {
				method: "POST",
			}),
	});
}

export function useDispatchQueueItem() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (queueItemId: string) =>
			readApiJson(`/api/queue/${encodeURIComponent(queueItemId)}/dispatch`, {
				method: "POST",
			}),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["active-run"] }),
				queryClient.invalidateQueries({ queryKey: ["queue"] }),
			]);
		},
	});
}

async function readLatestActiveRun(): Promise<ActiveRun | null> {
	const sessions = (await readApiJson<{ sessions: SessionRow[] }>("/api/sessions?limit=1")).sessions;
	const session = sessions[0];
	return session ? readActiveRunBySession(session.id) : null;
}

async function readActiveRunBySession(sessionId: string): Promise<ActiveRun | null> {
	const detail = await readApiJson<SessionDetail>(`/api/sessions/${encodeURIComponent(sessionId)}`);
	return mapSessionDetail(detail);
}

async function readMachines(): Promise<MachineWithAgents[]> {
	return (await readApiJson<{ machines: MachineWithAgents[] }>("/api/machines")).machines;
}

async function readMembers(): Promise<Array<WorkspaceMemberRow & { user?: UserRow }>> {
	const response = await readApiJson<{ members: Array<WorkspaceMemberRow & { user?: UserRow }> }>("/api/members");
	return response.members;
}

function mapWorkspaceSummary(response: CurrentWorkspaceResponse): WorkspaceSummary {
	return {
		branch: response.workspace.default_branch,
		costTodayUsd: response.costTodayUsd,
		id: response.workspace.id,
		machineCount: response.machineCount,
		name: response.workspace.name,
		pendingApprovals: response.pendingApprovals,
		privacyMode: response.workspace.privacy_mode,
		repo: response.workspace.repository_url ?? "Local repository",
	};
}

function mapSessionDetail(detail: SessionDetail): ActiveRun {
	const run = detail.runs[0] ?? null;
	const task = run?.task ?? detail.queueItem?.task ?? detail.session.title;
	const status = run?.status ?? detail.queueItem?.status ?? detail.session.status;
	const graphNodes = graphNodesForStatus(status);
	const terminalTabs = detail.runs.length ? detail.runs.map(mapRunToTerminalTab) : [];

	return {
		agentControlLabel: status === "running" ? "Agent control active" : "Waiting for bridge dispatch",
		approvals: mapApprovals(detail.approvals),
		branchName: run?.branch_name ?? "pending worktree",
		confidence: run?.confidence ?? detail.reports[0]?.confidence ?? 0,
		costUsd: run?.cost_usd ?? detail.reports[0]?.cost_usd ?? 0,
		graphEdges: [
			{ from: "task", id: "task-dispatch", status: status === "draft" || status === "queued" ? "waiting" : "complete", to: "dispatch" },
			{ from: "dispatch", id: "dispatch-run", status: status === "running" ? "active" : isTerminal(status) ? "complete" : "waiting", to: "run" },
			{ from: "run", id: "run-report", status: detail.reports.length ? "complete" : "waiting", to: "report" },
		],
		graphNodes,
		id: run?.id ?? detail.queueItem?.id ?? detail.session.id,
		latencyLabel: run?.latency_ms ? formatDuration(run.latency_ms) : "not measured",
		risk: classifyCommandRisk(task).risk,
		sessionId: detail.session.id,
		status,
		task,
		terminalTabs,
		timeline: timelineForSession(detail, status),
		title: detail.session.title,
		verification: verificationForSession(detail),
		worktreeLabel: run?.worktree_path_hash ? `hash:${run.worktree_path_hash.slice(0, 10)}` : "worktree pending",
	};
}

function graphNodesForStatus(status: RunStatus): AgentGraphNode[] {
	return [
		{ id: "task", label: "Task", metric: "persisted", status: "complete", subtitle: "D1 session and queue", x: 12, y: 48 },
		{
			id: "dispatch",
			label: "Dispatch",
			metric: status === "waiting-machine" ? "waiting" : "ready",
			status: status === "queued" || status === "waiting-machine" ? "waiting" : "complete",
			subtitle: "SessionHub to bridge",
			x: 38,
			y: 48,
		},
		{
			id: "run",
			label: "Run",
			metric: status,
			status: status === "running" || status === "verifying" ? "running" : isTerminal(status) ? "complete" : "idle",
			subtitle: "Local terminal agent",
			x: 64,
			y: 48,
		},
		{
			id: "report",
			label: "Report",
			metric: isTerminal(status) ? "ready" : "pending",
			status: isTerminal(status) ? "complete" : "waiting",
			subtitle: "Evidence and recommendation",
			x: 88,
			y: 48,
		},
	];
}

function mapRunToTerminalTab(run: RunRow): TerminalTab {
	return {
		id: run.id,
		label: run.agent_installation_id ? `Run ${run.id.slice(-6)}` : "Queued run",
		lines: [lineForRun(run)],
		runId: run.id,
		status: terminalStatus(run.status),
	};
}

function lineForRun(run: RunRow): TerminalLine {
	return {
		id: `${run.id}-state`,
		text: `Run ${run.status}: ${run.task}`,
		timestamp: timeLabel(run.updated_at),
		tone: run.status === "failed" ? "danger" : run.status === "completed" ? "success" : "info",
	};
}

function terminalStatus(status: RunStatus): TerminalTab["status"] {
	switch (status) {
		case "completed":
			return "passed";
		case "failed":
		case "cancelled":
			return "failed";
		case "waiting-approval":
		case "paused":
			return "waiting";
		case "running":
		case "verifying":
			return "running";
		default:
			return "idle";
	}
}

function timelineForSession(detail: SessionDetail, status: RunStatus): TimelineEvent[] {
	const events: TimelineEvent[] = [
		{
			description: detail.queueItem ? "The task is persisted and linked to this session." : "Session created.",
			id: `${detail.session.id}-created`,
			source: "browser",
			status: "complete",
			timeLabel: timeLabel(detail.session.created_at),
			title: "Session created",
		},
	];
	if (detail.queueItem) {
		events.push({
			description: `Queue item is ${detail.queueItem.status}.`,
			id: detail.queueItem.id,
			source: "worker",
			status: detail.queueItem.status === "waiting-machine" ? "blocked" : detail.queueItem.status === "running" ? "running" : "complete",
			timeLabel: timeLabel(detail.queueItem.updated_at),
			title: "Queue item persisted",
		});
	}
	for (const run of detail.runs) {
		events.push({
			description: run.task,
			id: run.id,
			source: "bridge",
			status: run.status === "running" || run.status === "verifying" ? "running" : isTerminal(run.status) ? "complete" : "waiting",
			timeLabel: timeLabel(run.updated_at),
			title: `Run ${run.status}`,
		});
	}
	if (detail.reports[0]) {
		events.push({
			description: detail.reports[0].summary,
			id: detail.reports[0].id,
			source: "worker",
			status: "complete",
			timeLabel: timeLabel(detail.reports[0].created_at),
			title: "Decision report created",
		});
	}
	if (!detail.queueItem && detail.runs.length === 0) {
		events.push({
			description: `Current session status is ${status}.`,
			id: `${detail.session.id}-status`,
			source: "worker",
			status: "waiting",
			timeLabel: timeLabel(detail.session.updated_at),
			title: "Waiting for work",
		});
	}
	return events;
}

function verificationForSession(detail: SessionDetail): VerificationResult[] {
	if (detail.reports[0]) {
		const report = parseReportJson(detail.reports[0]);
		if (report?.verification?.length) {
			return report.verification.map((verification, index) => ({
				command: verification.command,
				durationLabel: verification.durationMs ? formatDuration(verification.durationMs) : "recorded",
				id: verification.id ?? `${detail.reports[0]?.id}-verification-${index}`,
				label: verification.command,
				status: verification.status,
				summary: verification.summary ?? "Verifier evidence recorded.",
			}));
		}
	}
	return [
		{
			command: "bridge verifier suite",
			durationLabel: "pending",
			id: `${detail.session.id}-verification-pending`,
			label: "Verification",
			status: detail.runs.some((run) => run.status === "completed") ? "passed" : "pending",
			summary: detail.runs.length ? "Verifier evidence will attach after bridge completion." : "Dispatch a run to collect verifier evidence.",
		},
	];
}

function mapQueueItems(rows: QueueItemRow[]): QueueItem[] {
	return rows.map((row) => {
		const selector = parseJson(row.agent_selector_json);
		return {
			agent: agentLabel(stringField(selector, "kind") ?? stringField(selector, "agentKind") ?? "auto route"),
			branch: "workspace default",
			estimate: row.max_runtime_minutes ? `${row.max_runtime_minutes}m max` : "30m max",
			id: row.id,
			priority: row.priority,
			repo: stringField(parseJson(row.machine_selector_json), "repoPath") ?? "local repo",
			risk: classifyCommandRisk(row.task).risk,
			scheduleWindow: row.run_after ? `After ${timeLabel(row.run_after)}` : "Queue now",
			status: row.status,
			task: row.task,
		};
	});
}

function mapApprovals(rows: ApprovalRow[]): ApprovalRequest[] {
	return rows.map((row) => ({
		createdLabel: timeLabel(row.created_at),
		description: requestedActionDescription(row.requested_action_json),
		id: row.id,
		kind: row.kind,
		requestedBy: row.decided_by ?? "bridge",
		risk: row.risk,
		status: row.status,
		title: row.title,
	}));
}

function mapAgentInventory(machines: MachineWithAgents[]): AgentInstallation[] {
	return machines.flatMap((machine) =>
		machine.agents.map((agent) => ({
			authStatus: agent.auth_status,
			capabilities: parseStringArray(agent.capabilities_json) as AgentInstallation["capabilities"],
			command: agent.command,
			id: agent.id,
			kind: agent.agent_kind,
			lastSeenLabel: machine.last_seen_at ? timeLabel(machine.last_seen_at) : "not seen",
			latencyMs: machine.status === "online" ? 40 : undefined,
			name: agentLabel(agent.agent_kind),
			recommendedFor: recommendationForAgent(agent.agent_kind),
			status: agent.auth_status === "configured" ? "ready" : agent.auth_status === "missing" ? "auth-missing" : "missing",
			version: agent.version ?? undefined,
		})),
	);
}

function mapReports(rows: DecisionReportRow[]): DecisionReport[] {
	return rows.map((row) => {
		const report = parseReportJson(row);
		return {
			agentsUsed: report?.agentsUsed ?? [],
			candidateComparison: report?.candidateResults?.map((candidate) => ({
				agent: agentLabel(candidate.agentKind),
				id: candidate.candidateId,
				latencyLabel: formatDuration(candidate.latencyMs),
				notes: candidate.verifierResults?.[0]?.summary ?? "Evidence recorded.",
				recommendation: report.recommendation ?? row.recommendation,
				score: report.candidateScores?.find((score) => score.candidateId === candidate.candidateId)?.totalScore ?? row.confidence,
				status: candidate.status,
				verificationStatus: candidate.verifierResults?.[0]?.status ?? "pending",
			})),
			commandsRun: report?.commandsRun ?? 0,
			confidence: row.confidence,
			costUsd: row.cost_usd ?? 0,
			filesChanged: report?.filesChanged?.length ?? 0,
			humanInterventions: report?.humanInterventions?.length ?? 0,
			id: row.id,
			latencyLabel: row.latency_ms ? formatDuration(row.latency_ms) : "not measured",
			recommendation: row.recommendation,
			sessionId: row.session_id,
			summary: row.summary,
		};
	});
}

function mapPolicies(rows: PolicyRuleRow[]): PolicyRule[] {
	return rows.map((row) => ({
		action: row.action,
		defaultDecision: row.default_decision,
		id: row.id,
		reason: row.reason,
		risk: row.risk,
	}));
}

function mapSchedules(rows: ScheduledJobRow[]): ScheduledJob[] {
	return rows.map((row) => ({
		cron: row.cron,
		enabled: row.enabled === 1,
		id: row.id,
		lastStatus: row.last_status ?? "never-run",
		name: row.name,
		naturalLanguage: row.natural_language,
		nextRunLabel: row.next_run_at ? timeLabel(row.next_run_at) : "not scheduled",
		timezone: row.timezone,
	}));
}

function mapMetrics(rows: MetricSnapshotRow[]): ObservabilityMetric[] {
	if (rows.length === 0) {
		return [];
	}
	const grouped = new Map<string, MetricSnapshotRow[]>();
	for (const row of rows) {
		grouped.set(row.metric_name, [...(grouped.get(row.metric_name) ?? []), row]);
	}
	return [...grouped.entries()].map(([name, values]) => {
		const latest = values[0];
		return {
			changeLabel: `${values.length} samples`,
			id: name,
			label: name.replaceAll("_", " "),
			status: latest.metric_value < 0 ? "critical" : "healthy",
			trend: values.slice(0, 8).map((value) => Math.max(5, Math.min(100, value.metric_value))),
			value: formatMetricValue(name, latest.metric_value),
		};
	});
}

function mapAudit(rows: AuditLogRow[]): AuditTrailEntry[] {
	return rows.map((row) => ({
		action: row.action,
		actor: row.actor_id ?? "system",
		id: row.id,
		resource: row.resource_type,
		severity: row.action.includes("approval") ? "high" : "low",
		timeLabel: timeLabel(row.created_at),
	}));
}

function mapEvalRuns(rows: EvalRunRow[]): EvalRunSummary[] {
	return rows.map((row) => ({
		agent: agentLabel(row.agent_kind),
		dataset: row.dataset_id,
		id: row.id,
		latencyLabel: row.completed_at ? timeLabel(row.completed_at) : "pending",
		score: row.score ?? 0,
		status: row.status,
	}));
}

function mapMembers(rows: Array<WorkspaceMemberRow & { user?: UserRow }>): WorkspaceMember[] {
	return rows.map((row) => {
		const name = row.user?.display_name ?? row.user?.email ?? row.user_id;
		return {
			avatarLabel: name.slice(0, 1).toUpperCase(),
			email: row.user?.email ?? `${row.user_id}@agentdeck.local`,
			id: row.id,
			joinedLabel: row.joined_at ? timeLabel(row.joined_at) : "invited",
			name,
			role: row.role,
		};
	});
}

function mapRetention(rows: RetentionPolicyRow[]): RetentionPolicy[] {
	return rows.map((row) => ({
		action: row.action,
		id: row.id,
		resourceType: row.resource_type,
		retentionDays: row.retention_days,
		status: row.retention_days > 365 ? "review" : "active",
	}));
}

function parseReportJson(row: DecisionReportRow): Partial<{
	agentsUsed: AgentInstallation["kind"][];
	candidateResults: Array<{
		agentKind: AgentInstallation["kind"];
		candidateId: string;
		latencyMs: number;
		status: "cancelled" | "completed" | "failed" | "timeout";
		verifierResults?: Array<{ command: string; durationMs?: number; id: string; status: VerificationResult["status"]; summary?: string }>;
	}>;
	candidateScores: Array<{ candidateId: string; totalScore: number }>;
	commandsRun: number;
	filesChanged: unknown[];
	humanInterventions: unknown[];
	recommendation: DecisionReport["recommendation"];
	verification: Array<{ command: string; durationMs?: number; id: string; status: VerificationResult["status"]; summary?: string }>;
}> | null {
	try {
		return JSON.parse(row.report_json) as ReturnType<typeof parseReportJson>;
	} catch {
		return null;
	}
}

function requestedActionDescription(value: string): string {
	const parsed = parseJson(value);
	if (typeof parsed === "string") {
		return parsed;
	}
	if (isRecord(parsed)) {
		return stringField(parsed, "command") ?? stringField(parsed, "description") ?? stringField(parsed, "path") ?? "Review requested action.";
	}
	return "Review requested action.";
}

function parseJson(value: string | null): JsonValue | null {
	if (!value) {
		return null;
	}
	try {
		return JSON.parse(value) as JsonValue;
	} catch {
		return null;
	}
}

function parseStringArray(value: string): string[] {
	const parsed = parseJson(value);
	return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

function stringField(value: JsonValue | Record<string, unknown> | null, key: string): string | null {
	return isRecord(value) && typeof value[key] === "string" ? value[key] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTerminal(status: RunStatus): boolean {
	return status === "completed" || status === "failed" || status === "cancelled";
}

function agentLabel(value: string): string {
	return value
		.split("-")
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}

function recommendationForAgent(kind: AgentInstallation["kind"]): string {
	switch (kind) {
		case "claude-code":
			return "Large refactors and multi-file reasoning.";
		case "codex":
			return "Focused code edits, tests, and terminal workflows.";
		case "opencode":
			return "Local-first coding workflows.";
		case "qwen-code":
			return "Fast implementation passes and fallback routing.";
		case "pi":
			return "Pi adapter modes and structured JSON events.";
		case "aider":
			return "Patch-focused repository edits.";
		case "acp":
			return "Agent Client Protocol sessions.";
		default:
			return "General coding tasks.";
	}
}

function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	}
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) {
		return `${seconds}s`;
	}
	return `${Math.round(seconds / 60)}m`;
}

function formatMetricValue(name: string, value: number): string {
	if (name.includes("cost")) {
		return `$${value.toFixed(2)}`;
	}
	if (name.includes("latency")) {
		return formatDuration(value);
	}
	return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function timeLabel(value: string): string {
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) {
		return "unknown";
	}
	const diffMs = Date.now() - timestamp;
	const diffMinutes = Math.round(diffMs / 60_000);
	if (Math.abs(diffMinutes) < 1) {
		return "now";
	}
	if (Math.abs(diffMinutes) < 60) {
		return diffMinutes > 0 ? `${diffMinutes}m ago` : `in ${Math.abs(diffMinutes)}m`;
	}
	const diffHours = Math.round(diffMinutes / 60);
	if (Math.abs(diffHours) < 24) {
		return diffHours > 0 ? `${diffHours}h ago` : `in ${Math.abs(diffHours)}h`;
	}
	return new Date(timestamp).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}
