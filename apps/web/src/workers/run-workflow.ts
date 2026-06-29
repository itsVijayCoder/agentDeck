import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { AgentDeckEvent, AgentKind, PrivacyMode, RunDispatchControlMessage, RunStatus } from "@agentdeck/core";
import { isTerminalRunStatus, transitionRunStatus } from "@agentdeck/core";
import {
	createAgentDeckRepositories,
	parseNullableJsonColumn,
	type AgentDeckRepositories,
	type AgentInstallationRow,
	type JsonValue,
	type MachineRow,
	type QueueItemRow,
	type RunRow,
	type WorkspaceRow,
} from "@agentdeck/db";

import type { SessionHub } from "@/do/session-hub";
import { runDispatchControlMessageSchema } from "@/lib/phase-08-contracts";
import { queuePolicyFromScheduleWindow, shouldDispatch } from "@/lib/queue-policy";

export type RunWorkflowParams = {
	queueItemId: string;
	scheduledJobId?: string;
};

export type RunWorkflowResult =
	| { status: "completed"; reportId?: string; runId: string }
	| { status: "failed" | "timeout"; runId: string }
	| { reason: string; status: "waiting-machine" | "queued" };

export type RunWorkflowEnv = {
	AGENTDECK_ARTIFACTS: R2Bucket;
	AGENTDECK_DB: D1Database;
	SESSION_HUB: DurableObjectNamespace<SessionHub>;
};

type DispatchTarget =
	| {
			agentInstallationId: string;
			agentKind: AgentKind;
			machineId: string;
			privacyMode: PrivacyMode;
			queueItemId: string;
			runId: string;
			scheduledJobId?: string;
			sessionId: string;
			status: "ready";
			targetBranch: string;
			task: string;
			workspaceId: string;
			model?: string;
			provider?: string;
	  }
	| { reason: string; status: "queued" | "waiting-machine" };

type DispatchResult = { accepted: true; bridgeCount: number } | { accepted: false; reason: string };

const maxDispatchAttempts = 32;
const dispatchRetryDelay = "15 minutes";
const runPollDelay = "1 minute";

export class RunWorkflow extends WorkflowEntrypoint<RunWorkflowEnv, RunWorkflowParams> {
	override async run(event: Readonly<WorkflowEvent<RunWorkflowParams>>, step: WorkflowStep): Promise<RunWorkflowResult> {
		return runQueueWorkflow(this.env, event.payload, step);
	}
}

export async function runQueueWorkflow(
	env: RunWorkflowEnv,
	params: RunWorkflowParams,
	step: WorkflowStep,
): Promise<RunWorkflowResult> {
	let target: Extract<DispatchTarget, { status: "ready" }> | null = null;

	for (let attempt = 1; attempt <= maxDispatchAttempts; attempt += 1) {
		const prepared = await step.do(`prepare-dispatch-${attempt}`, async () => prepareDispatchTarget(env, params));
		if (prepared.status !== "ready") {
			if (attempt === maxDispatchAttempts) {
				return prepared;
			}
			await step.sleep(`wait-before-dispatch-${attempt}`, dispatchRetryDelay);
			continue;
		}

		const dispatch = await step.do(`dispatch-run-${attempt}`, async () => dispatchRun(env, prepared));
		if (dispatch.accepted) {
			await step.do(`mark-dispatched-running-${attempt}`, async () =>
				markDispatchedRunning(env, prepared.queueItemId, prepared.runId),
			);
			target = prepared;
			break;
		}

		await step.do(`mark-dispatch-waiting-${attempt}`, async () =>
			markQueueAndRunWaiting(env, prepared.queueItemId, prepared.runId, dispatch.reason),
		);
		if (attempt === maxDispatchAttempts) {
			return { reason: dispatch.reason, status: "waiting-machine" };
		}
		await step.sleep(`wait-after-dispatch-${attempt}`, dispatchRetryDelay);
	}

	if (!target) {
		return { reason: "No dispatch target was available.", status: "waiting-machine" };
	}

	const completedRun = await waitForRunCompletion(env, step, target.runId, target.queueItemId);
	if (completedRun.status === "timeout") {
		return { runId: target.runId, status: "timeout" };
	}

	if (completedRun.status === "failed" || completedRun.status === "cancelled") {
		return { runId: target.runId, status: "failed" };
	}

	const reportId = await step.do("generate-decision-report", async () => generateDecisionReport(env, target.runId));
	await step.do("mark-queue-completed", async () => markQueueCompleted(env, target.queueItemId, target.runId, reportId));
	return { reportId, runId: target.runId, status: "completed" };
}

async function prepareDispatchTarget(env: RunWorkflowEnv, params: RunWorkflowParams): Promise<DispatchTarget> {
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	const queueItem = await repositories.queue.findById(params.queueItemId);
	if (!queueItem) {
		throw new Error(`Queue item ${params.queueItemId} was not found.`);
	}

	if (queueItem.status === "cancelled" || queueItem.status === "completed") {
		return { reason: `Queue item is already ${queueItem.status}.`, status: "queued" };
	}

	const workspace = await repositories.workspaces.findById(queueItem.workspace_id);
	if (!workspace) {
		throw new Error(`Workspace ${queueItem.workspace_id} was not found.`);
	}

	const scheduleWindow = parseNullableJsonColumn(queueItem.schedule_window_json);
	const policy = queuePolicyFromScheduleWindow(scheduleWindow);
	const windowDecision = shouldDispatch({
		concurrentRuns: 0,
		machineOnline: true,
		now: new Date(),
		policy,
		timezone: "UTC",
	});
	if (!windowDecision.dispatch && windowDecision.reason === "Outside allowed hours") {
		if (queueItem.status === "queued") {
			await transitionQueueItemStatus(repositories, queueItem.id, "queued");
			return { reason: windowDecision.reason, status: "queued" };
		}
		return { reason: windowDecision.reason, status: "waiting-machine" };
	}

	const session = await ensureQueueSession(repositories, workspace, queueItem);
	const existingRun = await repositories.runs.findById(`run_${sanitizeId(queueItem.id)}`);
	const target = await selectDispatchTarget(repositories, queueItem, policy, existingRun);
	if (!target) {
		await transitionQueueItemStatus(repositories, queueItem.id, "waiting-machine");
		return { reason: "No eligible online machine with a configured agent is available.", status: "waiting-machine" };
	}

	const run = await ensureQueueRun(repositories, {
		agentInstallationId: target.agentInstallation.id,
		branchName: `agentdeck/${sanitizeId(queueItem.id).slice(0, 48)}`,
		machineId: target.machine.id,
		queueItem,
		scheduledJobId: params.scheduledJobId,
		sessionId: session.id,
		workspace,
	});
	const agentSelector = parseNullableJsonColumn(queueItem.agent_selector_json);

	return {
		agentInstallationId: target.agentInstallation.id,
		agentKind: target.agentInstallation.agent_kind,
		machineId: target.machine.id,
		privacyMode: workspace.privacy_mode,
		queueItemId: queueItem.id,
		runId: run.id,
		...(params.scheduledJobId ? { scheduledJobId: params.scheduledJobId } : {}),
		sessionId: session.id,
		status: "ready",
		targetBranch: workspace.default_branch,
		task: queueItem.task,
		workspaceId: workspace.id,
		...modelProviderFromSelector(agentSelector),
	};
}

async function selectDispatchTarget(
	repositories: AgentDeckRepositories,
	queueItem: QueueItemRow,
	policy: ReturnType<typeof queuePolicyFromScheduleWindow>,
	existingRun: RunRow | null,
): Promise<{ agentInstallation: AgentInstallationRow; machine: MachineRow } | null> {
	const machineSelector = parseNullableJsonColumn(queueItem.machine_selector_json);
	const agentSelector = parseNullableJsonColumn(queueItem.agent_selector_json);
	const requestedMachineId = stringField(machineSelector, "machineId") ?? stringField(machineSelector, "id");
	const requestedAgentKind = agentKindField(agentSelector);
	const machines = await repositories.machines.listByWorkspace(queueItem.workspace_id, "online", 50);

	for (const machine of machines) {
		if (requestedMachineId && machine.id !== requestedMachineId) {
			continue;
		}

		const installations = await repositories.agentInstallations.listByMachine(machine.id);
		const agentInstallation = installations.find(
			(installation) =>
				(!requestedAgentKind || installation.agent_kind === requestedAgentKind) &&
				installation.auth_status !== "missing" &&
				installation.auth_status !== "expired",
		);
		if (!agentInstallation) {
			continue;
		}

		const activeRuns = await repositories.runs.countActiveByMachine(machine.id);
		const concurrentRuns = existingRun?.machine_id === machine.id ? Math.max(0, activeRuns - 1) : activeRuns;
		const dispatch = shouldDispatch({
			concurrentRuns,
			machineOnline: true,
			now: new Date(),
			policy,
			timezone: "UTC",
		});
		if (!dispatch.dispatch) {
			continue;
		}

		return { agentInstallation, machine };
	}

	return null;
}

async function dispatchRun(env: RunWorkflowEnv, target: Extract<DispatchTarget, { status: "ready" }>): Promise<DispatchResult> {
	const message: RunDispatchControlMessage = runDispatchControlMessageSchema.parse({
		agentInstallationId: target.agentInstallationId,
		agentKind: target.agentKind,
		machineId: target.machineId,
		privacyMode: target.privacyMode,
		queueItemId: target.queueItemId,
		runId: target.runId,
		...(target.scheduledJobId ? { scheduledJobId: target.scheduledJobId } : {}),
		sessionId: target.sessionId,
		targetBranch: target.targetBranch,
		task: target.task,
		type: "run.dispatch",
		workspaceId: target.workspaceId,
		...(target.model ? { model: target.model } : {}),
		...(target.provider ? { provider: target.provider } : {}),
	});
	const id = env.SESSION_HUB.idFromName(target.sessionId);
	const stub = env.SESSION_HUB.get(id);
	const response = await stub.fetch("https://agentdeck.internal/dispatch", {
		body: JSON.stringify(message),
		headers: {
			"content-type": "application/json",
		},
		method: "POST",
	});

	if (!response.ok) {
		return { accepted: false, reason: `SessionHub dispatch failed with HTTP ${response.status}.` };
	}

	const result = (await response.json()) as { accepted?: unknown; bridgeCount?: unknown };
	if (result.accepted === true && typeof result.bridgeCount === "number") {
		return { accepted: true, bridgeCount: result.bridgeCount };
	}

	return { accepted: false, reason: "SessionHub dispatch did not return an accepted response." };
}

async function waitForRunCompletion(
	env: RunWorkflowEnv,
	step: WorkflowStep,
	runId: string,
	queueItemId: string,
): Promise<{ status: "cancelled" | "completed" | "failed" | "timeout" }> {
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	const queueItem = await repositories.queue.findById(queueItemId);
	const maxChecks = Math.max(1, queueItem?.max_runtime_minutes ?? 30);

	for (let check = 1; check <= maxChecks; check += 1) {
		const run = await step.do(`read-run-status-${check}`, async () => {
			const current = await createAgentDeckRepositories(env.AGENTDECK_DB).runs.findById(runId);
			return current ? { status: current.status } : null;
		});

		if (run && isTerminalRunStatus(run.status)) {
			return { status: terminalWorkflowStatus(run.status) };
		}

		await step.sleep(`wait-run-status-${check}`, runPollDelay);
	}

	await transitionRunToStatus(repositories, runId, "failed");
	await transitionQueueItemStatus(repositories, queueItemId, "failed");
	await appendWorkerEvent(repositories, {
		payload: { error: "Run timed out while waiting for bridge completion.", retryable: true },
		runId,
		type: "run.failed",
	});
	return { status: "timeout" };
}

function terminalWorkflowStatus(status: RunStatus): "cancelled" | "completed" | "failed" {
	if (status === "completed" || status === "failed" || status === "cancelled") {
		return status;
	}
	throw new Error(`Unexpected non-terminal run status: ${status}`);
}

async function generateDecisionReport(env: RunWorkflowEnv, runId: string): Promise<string> {
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	const run = await repositories.runs.findById(runId);
	if (!run) {
		throw new Error(`Run ${runId} was not found.`);
	}
	const existingReportId = `report_${sanitizeId(runId)}`;
	if (await repositories.decisionReports.findById(existingReportId)) {
		return existingReportId;
	}

	const session = await repositories.sessions.findById(run.session_id);
	if (!session) {
		throw new Error(`Session ${run.session_id} was not found.`);
	}

	const events = await repositories.events.listBySession(run.session_id, -1, 1000);
	const artifacts = await repositories.artifacts.listBySession(run.session_id, 200);
	const approvals = await repositories.approvals.listByRun(run.id, 200);
	const report = {
		approvals: approvals.length,
		artifacts: artifacts.length,
		events: events.length,
		generatedAt: new Date().toISOString(),
		queueItemId: run.queue_item_id,
		runId: run.id,
		status: run.status,
		task: run.task,
	};
	const objectKey = `workspaces/${session.workspace_id}/sessions/${session.id}/reports/${existingReportId}.json`;

	await env.AGENTDECK_ARTIFACTS.put(objectKey, JSON.stringify(report), {
		httpMetadata: {
			contentType: "application/json",
		},
	});

	await repositories.decisionReports.create({
		confidence: run.confidence ?? 0.85,
		costUsd: run.cost_usd,
		id: existingReportId,
		latencyMs: run.latency_ms,
		objectKey,
		recommendation: run.status === "completed" ? "accept" : "review-carefully",
		report: report as unknown as JsonValue,
		sessionId: session.id,
		summary: `Run ${run.status}: ${run.task}`,
		workspaceId: session.workspace_id,
	});
	await appendWorkerEvent(repositories, {
		payload: {
			recommendation: run.status === "completed" ? "accept" : "review-carefully",
			reportId: existingReportId,
		},
		runId: run.id,
		sessionId: session.id,
		type: "report.created",
		workspaceId: session.workspace_id,
	});

	return existingReportId;
}

async function markDispatchedRunning(env: RunWorkflowEnv, queueItemId: string, runId: string): Promise<void> {
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	await transitionQueueItemStatus(repositories, queueItemId, "running");
	await transitionRunToStatus(repositories, runId, "running");
	await appendWorkerEvent(repositories, {
		payload: { queueItemId, runId },
		runId,
		type: "queue.item_started",
	});
}

async function markQueueAndRunWaiting(
	env: RunWorkflowEnv,
	queueItemId: string,
	runId: string,
	reason: string,
): Promise<void> {
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	await transitionQueueItemStatus(repositories, queueItemId, "waiting-machine");
	await transitionRunToStatus(repositories, runId, "waiting-machine");
	await appendWorkerEvent(repositories, {
		payload: { error: reason, queueItemId },
		runId,
		type: "queue.item_failed",
	});
}

async function markQueueCompleted(
	env: RunWorkflowEnv,
	queueItemId: string,
	runId: string,
	reportId: string,
): Promise<void> {
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	await transitionQueueItemStatus(repositories, queueItemId, "completed");
	await appendWorkerEvent(repositories, {
		payload: { queueItemId, reportId },
		runId,
		type: "queue.item_completed",
	});
}

async function ensureQueueSession(
	repositories: AgentDeckRepositories,
	workspace: WorkspaceRow,
	queueItem: QueueItemRow,
): Promise<{ id: string }> {
	const sessionId = `queue_${sanitizeId(queueItem.id)}`;
	const existing = await repositories.sessions.findById(sessionId);
	if (existing) {
		return existing;
	}

	const now = new Date().toISOString();
	const session = await repositories.sessions.create({
		createdAt: now,
		createdBy: queueItem.created_by,
		id: sessionId,
		privacyMode: workspace.privacy_mode,
		status: "queued",
		title: queueItem.task.slice(0, 500),
		updatedAt: now,
		workspaceId: workspace.id,
	});
	await appendWorkerEvent(repositories, {
		payload: { privacyMode: workspace.privacy_mode, title: session.title },
		sessionId: session.id,
		type: "session.created",
		workspaceId: workspace.id,
	});
	return session;
}

async function ensureQueueRun(
	repositories: AgentDeckRepositories,
	input: {
		agentInstallationId: string;
		branchName: string;
		machineId: string;
		queueItem: QueueItemRow;
		scheduledJobId?: string;
		sessionId: string;
		workspace: WorkspaceRow;
	},
): Promise<RunRow> {
	const runId = `run_${sanitizeId(input.queueItem.id)}`;
	const existing = await repositories.runs.findById(runId);
	if (existing) {
		return existing;
	}

	const now = new Date().toISOString();
	const run = await repositories.runs.create({
		agentInstallationId: input.agentInstallationId,
		branchName: input.branchName,
		createdAt: now,
		id: runId,
		machineId: input.machineId,
		queueItemId: input.queueItem.id,
		scheduledJobId: input.scheduledJobId ?? null,
		sessionId: input.sessionId,
		status: "queued",
		task: input.queueItem.task,
		updatedAt: now,
	});
	await appendWorkerEvent(repositories, {
		payload: { targetBranch: input.workspace.default_branch, task: input.queueItem.task },
		runId: run.id,
		sessionId: input.sessionId,
		type: "run.created",
		workspaceId: input.workspace.id,
	});
	return run;
}

async function transitionQueueItemStatus(
	repositories: AgentDeckRepositories,
	queueItemId: string,
	nextStatus: RunStatus,
): Promise<void> {
	const queueItem = await repositories.queue.findById(queueItemId);
	if (!queueItem || queueItem.status === nextStatus) {
		return;
	}

	const transition = transitionRunStatus(queueItem.status, nextStatus);
	if (!transition.ok) {
		throw new Error(transition.reason);
	}

	await repositories.queue.update({
		id: queueItemId,
		status: nextStatus,
	});
}

async function transitionRunToStatus(
	repositories: AgentDeckRepositories,
	runId: string,
	nextStatus: RunStatus,
): Promise<void> {
	const run = await repositories.runs.findById(runId);
	if (!run || run.status === nextStatus) {
		return;
	}

	const transition = transitionRunStatus(run.status, nextStatus);
	if (!transition.ok) {
		throw new Error(transition.reason);
	}

	await repositories.runs.updateStatus({
		completedAt: isTerminalRunStatus(nextStatus) ? new Date().toISOString() : undefined,
		id: runId,
		startedAt: nextStatus === "running" ? new Date().toISOString() : undefined,
		status: nextStatus,
	});
}

async function appendWorkerEvent(
	repositories: AgentDeckRepositories,
	input: {
		payload: JsonValue;
		runId?: string | null;
		sessionId?: string;
		type: AgentDeckEvent["type"];
		workspaceId?: string;
	},
): Promise<void> {
	let sessionId = input.sessionId;
	let workspaceId = input.workspaceId;
	if ((!sessionId || !workspaceId) && input.runId) {
		const run = await repositories.runs.findById(input.runId);
		sessionId = sessionId ?? run?.session_id;
		if (!workspaceId && run) {
			const session = await repositories.sessions.findById(run.session_id);
			workspaceId = session?.workspace_id;
		}
	}
	if (!sessionId || !workspaceId) {
		return;
	}

	const seq = await repositories.events.nextSeq(sessionId);
	await repositories.events.append({
		event: {
			createdAt: new Date().toISOString(),
			id: crypto.randomUUID(),
			payload: input.payload,
			...(input.runId ? { runId: input.runId } : {}),
			seq,
			sessionId,
			source: "worker",
			type: input.type,
			visibility: "metadata",
			workspaceId,
		} as AgentDeckEvent,
	});
}

function modelProviderFromSelector(value: JsonValue | null): { model?: string; provider?: string } {
	const model = stringField(value, "model");
	const provider = stringField(value, "provider");
	return {
		...(model ? { model } : {}),
		...(provider ? { provider } : {}),
	};
}

function agentKindField(value: JsonValue | null): AgentKind | null {
	const kind = stringField(value, "agentKind") ?? stringField(value, "kind");
	if (
		kind === "claude-code" ||
		kind === "codex" ||
		kind === "opencode" ||
		kind === "qwen-code" ||
		kind === "pi" ||
		kind === "aider" ||
		kind === "acp"
	) {
		return kind;
	}
	return null;
}

function stringField(value: JsonValue | null, key: string): string | null {
	return isRecord(value) && typeof value[key] === "string" ? value[key] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeId(value: string): string {
	return value.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 160);
}
