import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type {
	AgentCandidate,
	AgentDeckEvent,
	AgentKind,
	CandidateDiffSummary,
	CandidateResult,
	DecisionReportDetail,
	HumanIntervention,
	PrivacyMode,
	RoutingDecision,
	RoutingStrategy,
	RunDispatchControlMessage,
	RunStatus,
	TaskClassification,
} from "@agentdeck/core";
import { isTerminalRunStatus, transitionRunStatus } from "@agentdeck/core";
import {
	classifyTask,
	generateDecisionReportDetail,
	judgeCandidates,
	routeTask,
	synthesizeCandidates,
	type RouteTaskOptions,
} from "@agentdeck/harness";
import {
	createAgentDeckRepositories,
	parseNullableJsonColumn,
	type AgentDeckRepositories,
	type AgentInstallationRow,
	type ArtifactRow,
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
	| { status: "completed"; reportId?: string; runId: string; runIds: string[] }
	| { status: "failed" | "timeout"; runId: string; runIds: string[] }
	| { reason: string; status: "waiting-machine" | "queued" };

export type RunWorkflowEnv = {
	AGENTDECK_ARTIFACTS: R2Bucket;
	AGENTDECK_DB: D1Database;
	SESSION_HUB: DurableObjectNamespace<SessionHub>;
};

type PreparedCandidate = {
	agentInstallationId: string;
	agentKind: AgentKind;
	candidate: AgentCandidate;
	machineId: string;
	privacyMode: PrivacyMode;
	queueItemId: string;
	runId: string;
	scheduledJobId?: string;
	sessionId: string;
	targetBranch: string;
	task: string;
	worktreeBranch: string;
	workspaceId: string;
	model?: string;
	provider?: string;
};

type PreparedOrchestration =
	| {
			classification: TaskClassification;
			orchestrationId: string;
			queueItemId: string;
			routing: RoutingDecision;
			sessionId: string;
			status: "ready";
			targets: PreparedCandidate[];
			task: string;
			workspaceId: string;
	  }
	| { reason: string; status: "queued" | "waiting-machine" };

type DispatchResult = { accepted: true; bridgeCount: number } | { accepted: false; reason: string };

const maxDispatchAttempts = 32;
const dispatchRetryDelay = "15 minutes";
const runPollDelay = "1 minute";
const maxPatchSummaryBytes = 256 * 1024;

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
	let orchestration: Extract<PreparedOrchestration, { status: "ready" }> | null = null;

	for (let attempt = 1; attempt <= maxDispatchAttempts; attempt += 1) {
		const prepared = await step.do(`prepare-orchestration-${attempt}`, async () => prepareOrchestration(env, params));
		if (prepared.status !== "ready") {
			if (attempt === maxDispatchAttempts) {
				return prepared;
			}
			await step.sleep(`wait-before-orchestration-${attempt}`, dispatchRetryDelay);
			continue;
		}

		const dispatches: Array<{ dispatch: DispatchResult; target: PreparedCandidate }> = [];
		for (const target of prepared.targets) {
			const dispatch = await step.do(`dispatch-${target.candidate.id}-${attempt}`, async () =>
				dispatchRun(env, prepared.orchestrationId, prepared.routing.strategy, target),
			);
			dispatches.push({ dispatch, target });
		}

		const acceptedTargets = dispatches.filter(
			(item): item is { dispatch: { accepted: true; bridgeCount: number }; target: PreparedCandidate } => item.dispatch.accepted,
		);
		if (acceptedTargets.length > 0) {
			for (const { target } of acceptedTargets) {
				await step.do(`mark-${target.candidate.id}-running-${attempt}`, async () =>
					markDispatchedRunning(env, target.queueItemId, target.runId),
				);
			}
			orchestration = {
				...prepared,
				targets: acceptedTargets.map(({ target }) => target),
			};
			break;
		}

		const reason = dispatches.map(({ dispatch }) => (dispatch.accepted ? "" : dispatch.reason)).find(Boolean) ?? "No bridge accepted dispatch.";
		for (const { target } of dispatches) {
			await step.do(`mark-${target.candidate.id}-waiting-${attempt}`, async () =>
				markQueueAndRunWaiting(env, target.queueItemId, target.runId, reason),
			);
		}
		if (attempt === maxDispatchAttempts) {
			return { reason, status: "waiting-machine" };
		}
		await step.sleep(`wait-after-orchestration-${attempt}`, dispatchRetryDelay);
	}

	if (!orchestration) {
		return { reason: "No dispatch target was available.", status: "waiting-machine" };
	}

	const completedRuns: Array<{ runId: string; status: "cancelled" | "completed" | "failed" | "timeout" }> = [];
	for (const target of orchestration.targets) {
		const completedRun = await waitForRunCompletion(env, step, target.runId, target.queueItemId);
		completedRuns.push({ runId: target.runId, status: completedRun.status });
	}

	const candidateResults = await step.do("collect-candidate-results", async () =>
		collectCandidateResults(env, orchestration, completedRuns),
	);
	const reportId = await step.do("generate-orchestration-report", async () =>
		generateOrchestrationReport(env, orchestration, candidateResults),
	);
	const report = await step.do("read-orchestration-report", async () => readDecisionReport(env, reportId));
	const runIds = orchestration.targets.map((target) => target.runId);
	await step.do("mark-queue-final", async () => markQueueFinal(env, orchestration.queueItemId, reportId, report));

	if (!report || report.recommendation === "rerun" || report.recommendation === "reject") {
		return { runId: runIds[0] ?? "", runIds, status: "failed" };
	}

	return { reportId, runId: report.synthesis.winningRunId ?? runIds[0] ?? "", runIds, status: "completed" };
}

async function prepareOrchestration(env: RunWorkflowEnv, params: RunWorkflowParams): Promise<PreparedOrchestration> {
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
		return { reason: windowDecision.reason, status: queueItem.status === "queued" ? "queued" : "waiting-machine" };
	}

	const session = await ensureQueueSession(repositories, workspace, queueItem);
	const agentSelector = parseNullableJsonColumn(queueItem.agent_selector_json);
	const machineSelector = parseNullableJsonColumn(queueItem.machine_selector_json);
	const requestedMachineId = stringField(machineSelector, "machineId") ?? stringField(machineSelector, "id");
	const requestedAgentKind = agentKindField(agentSelector);
	const eligibleTargets = await listEligibleTargets(repositories, queueItem, policy, {
		requestedAgentKind,
		requestedMachineId,
	});
	const availableAgents = eligibleTargets.map((target) => target.agentInstallation.agent_kind);
	const classification = classifyTask(queueItem.task);
	const routing = routeTask(classification, availableAgents, workspace.privacy_mode, routeOptionsFromSelector(agentSelector));
	const targets = await prepareCandidateTargets(repositories, {
		classification,
		eligibleTargets,
		params,
		policy,
		queueItem,
		routing,
		sessionId: session.id,
		workspace,
	});

	if (targets.length === 0) {
		await transitionQueueItemStatus(repositories, queueItem.id, "waiting-machine");
		return { reason: routing.reason, status: "waiting-machine" };
	}

	return {
		classification,
		orchestrationId: `orch_${sanitizeId(queueItem.id)}`,
		queueItemId: queueItem.id,
		routing: {
			...routing,
			candidates: targets.map((target) => target.candidate),
		},
		sessionId: session.id,
		status: "ready",
		targets,
		task: queueItem.task,
		workspaceId: workspace.id,
	};
}

async function listEligibleTargets(
	repositories: AgentDeckRepositories,
	queueItem: QueueItemRow,
	policy: ReturnType<typeof queuePolicyFromScheduleWindow>,
	input: {
		requestedAgentKind: AgentKind | null;
		requestedMachineId: string | null;
	},
): Promise<Array<{ activeRuns: number; agentInstallation: AgentInstallationRow; machine: MachineRow }>> {
	const machines = await repositories.machines.listByWorkspace(queueItem.workspace_id, "online", 50);
	const targets: Array<{ activeRuns: number; agentInstallation: AgentInstallationRow; machine: MachineRow }> = [];

	for (const machine of machines) {
		if (input.requestedMachineId && machine.id !== input.requestedMachineId) {
			continue;
		}

		const activeRuns = await repositories.runs.countActiveByMachine(machine.id);
		const dispatch = shouldDispatch({
			concurrentRuns: activeRuns,
			machineOnline: true,
			now: new Date(),
			policy,
			timezone: "UTC",
		});
		if (!dispatch.dispatch) {
			continue;
		}

		const installations = await repositories.agentInstallations.listByMachine(machine.id);
		for (const agentInstallation of installations) {
			if (input.requestedAgentKind && agentInstallation.agent_kind !== input.requestedAgentKind) {
				continue;
			}
			if (agentInstallation.auth_status === "missing" || agentInstallation.auth_status === "expired") {
				continue;
			}
			targets.push({ activeRuns, agentInstallation, machine });
		}
	}

	return targets;
}

async function prepareCandidateTargets(
	repositories: AgentDeckRepositories,
	input: {
		classification: TaskClassification;
		eligibleTargets: Array<{ activeRuns: number; agentInstallation: AgentInstallationRow; machine: MachineRow }>;
		params: RunWorkflowParams;
		policy: ReturnType<typeof queuePolicyFromScheduleWindow>;
		queueItem: QueueItemRow;
		routing: RoutingDecision;
		sessionId: string;
		workspace: WorkspaceRow;
	},
): Promise<PreparedCandidate[]> {
	const prepared: PreparedCandidate[] = [];
	const reservedMachineLoad = new Map<string, number>();

	for (const candidate of input.routing.candidates) {
		const selected = input.eligibleTargets.find((target) => {
			if (target.agentInstallation.agent_kind !== candidate.agentKind) {
				return false;
			}
			const reserved = reservedMachineLoad.get(target.machine.id) ?? 0;
			return target.activeRuns + reserved < input.policy.maxConcurrentRunsPerMachine;
		});
		if (!selected) {
			continue;
		}

		reservedMachineLoad.set(selected.machine.id, (reservedMachineLoad.get(selected.machine.id) ?? 0) + 1);
		const worktreeBranch = `agentdeck/${sanitizeId(input.queueItem.id)}/${candidate.id}`;
		const run = await ensureQueueRun(repositories, {
			agentInstallationId: selected.agentInstallation.id,
			branchName: worktreeBranch,
			candidate,
			candidateCount: input.routing.candidates.length,
			machineId: selected.machine.id,
			queueItem: input.queueItem,
			routingStrategy: input.routing.strategy,
			scheduledJobId: input.params.scheduledJobId,
			sessionId: input.sessionId,
			workspace: input.workspace,
		});

		prepared.push({
			agentInstallationId: selected.agentInstallation.id,
			agentKind: selected.agentInstallation.agent_kind,
			candidate: {
				...candidate,
				worktreeBranch,
			},
			machineId: selected.machine.id,
			privacyMode: input.workspace.privacy_mode,
			queueItemId: input.queueItem.id,
			runId: run.id,
			...(input.params.scheduledJobId ? { scheduledJobId: input.params.scheduledJobId } : {}),
			sessionId: input.sessionId,
			targetBranch: input.workspace.default_branch,
			task: input.queueItem.task,
			worktreeBranch,
			workspaceId: input.workspace.id,
			...(candidate.model ? { model: candidate.model } : {}),
			...(candidate.provider ? { provider: candidate.provider } : {}),
		});
	}

	return prepared;
}

async function dispatchRun(
	env: RunWorkflowEnv,
	orchestrationId: string,
	routingStrategy: RoutingStrategy,
	target: PreparedCandidate,
): Promise<DispatchResult> {
	const message: RunDispatchControlMessage = runDispatchControlMessageSchema.parse({
		agentInstallationId: target.agentInstallationId,
		agentKind: target.agentKind,
		candidateId: target.candidate.id,
		candidateLabel: target.candidate.label,
		machineId: target.machineId,
		orchestrationId,
		privacyMode: target.privacyMode,
		queueItemId: target.queueItemId,
		runId: target.runId,
		routingStrategy,
		...(target.scheduledJobId ? { scheduledJobId: target.scheduledJobId } : {}),
		sessionId: target.sessionId,
		targetBranch: target.targetBranch,
		task: target.task,
		type: "run.dispatch",
		worktreeBranch: target.worktreeBranch,
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
		const run = await step.do(`read-run-status-${sanitizeId(runId)}-${check}`, async () => {
			const current = await createAgentDeckRepositories(env.AGENTDECK_DB).runs.findById(runId);
			return current ? { status: current.status } : null;
		});

		if (run && isTerminalRunStatus(run.status)) {
			return { status: terminalWorkflowStatus(run.status) };
		}

		await step.sleep(`wait-run-status-${sanitizeId(runId)}-${check}`, runPollDelay);
	}

	await transitionRunToStatus(repositories, runId, "failed");
	await appendWorkerEvent(repositories, {
		payload: { error: "Run timed out while waiting for bridge completion.", retryable: true },
		runId,
		type: "run.failed",
	});
	return { status: "timeout" };
}

async function collectCandidateResults(
	env: RunWorkflowEnv,
	orchestration: Extract<PreparedOrchestration, { status: "ready" }>,
	completedRuns: ReadonlyArray<{ runId: string; status: "cancelled" | "completed" | "failed" | "timeout" }>,
): Promise<CandidateResult[]> {
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	const artifacts = await repositories.artifacts.listBySession(orchestration.sessionId, 500);
	const results: CandidateResult[] = [];

	for (const target of orchestration.targets) {
		const run = await repositories.runs.findById(target.runId);
		const completed = completedRuns.find((item) => item.runId === target.runId);
		const runStatus = completed?.status ?? terminalWorkflowStatus(run?.status ?? "failed");
		const runArtifacts = artifacts.filter((artifact) => artifact.run_id === target.runId);
		const patchArtifact = runArtifacts.find((artifact) => artifact.kind === "patch-diff");
		const approvals = await repositories.approvals.listByRun(target.runId, 100);
		const latencyMs = run?.latency_ms ?? latencyMsFromRow(run) ?? 0;
		const diff = patchArtifact ? await diffSummaryFromArtifact(env, patchArtifact) : null;

		results.push({
			agentKind: target.agentKind,
			candidateId: target.candidate.id,
			label: target.candidate.label,
			latencyMs,
			policyFit: approvals.some((approval) => approval.status === "rejected") ? 0.2 : 0.7,
			riskFindings: approvals.map((approval) => ({
				description: approval.title,
				severity: approval.risk,
			})),
			runId: target.runId,
			status: runStatus,
			...(diff ? { diff } : {}),
			...(run?.cost_usd === null || run?.cost_usd === undefined ? {} : { costUsd: run.cost_usd }),
			verifierResults: [
				{
					command: "bridge verifier suite",
					id: `${target.runId}-bridge-verifier`,
					status: runStatus === "completed" ? "passed" : "failed",
					summary:
						runStatus === "completed"
							? "Bridge completed terminal execution and verifier stage."
							: "Bridge did not produce a passing terminal and verifier result.",
				},
			],
		});
	}

	return results;
}

async function generateOrchestrationReport(
	env: RunWorkflowEnv,
	orchestration: Extract<PreparedOrchestration, { status: "ready" }>,
	candidateResults: readonly CandidateResult[],
): Promise<string> {
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	const reportId = `report_${sanitizeId(orchestration.queueItemId)}`;
	if (await repositories.decisionReports.findById(reportId)) {
		return reportId;
	}

	const scores = judgeCandidates(candidateResults);
	const synthesis = synthesizeCandidates(candidateResults, scores);
	await appendWorkerEvent(repositories, {
		payload: {
			candidateRunIds: candidateResults.map((candidate) => candidate.runId),
			orchestrationId: orchestration.orchestrationId,
		},
		sessionId: orchestration.sessionId,
		type: "judge.started",
		workspaceId: orchestration.workspaceId,
	});
	for (const score of scores) {
		await appendWorkerEvent(repositories, {
			payload: {
				candidateId: score.candidateId,
				recommendation: score.recommendation,
				runId: score.runId,
				score: score.totalScore,
			},
			runId: score.runId,
			type: "judge.scored",
		});
	}
	await appendWorkerEvent(repositories, {
		payload: {
			candidateRunIds: candidateResults.map((candidate) => candidate.runId),
			orchestrationId: orchestration.orchestrationId,
		},
		sessionId: orchestration.sessionId,
		type: "synthesis.started",
		workspaceId: orchestration.workspaceId,
	});
	await appendWorkerEvent(repositories, {
		payload: {
			recommendation: synthesis.recommendation,
			strategy: synthesis.strategy,
			...(synthesis.winningCandidateId ? { winningCandidateId: synthesis.winningCandidateId } : {}),
			...(synthesis.winningRunId ? { winningRunId: synthesis.winningRunId } : {}),
		},
		runId: synthesis.winningRunId,
		sessionId: orchestration.sessionId,
		type: "synthesis.completed",
		workspaceId: orchestration.workspaceId,
	});

	const humanInterventions = await collectHumanInterventions(repositories, candidateResults);
	const report = generateDecisionReportDetail({
		candidates: candidateResults,
		classification: orchestration.classification,
		id: reportId,
		routing: orchestration.routing,
		scores,
		sessionId: orchestration.sessionId,
		synthesis,
		task: orchestration.task,
		workspaceId: orchestration.workspaceId,
		humanInterventions,
	});
	const objectKey = `workspaces/${orchestration.workspaceId}/sessions/${orchestration.sessionId}/reports/${reportId}.json`;

	await env.AGENTDECK_ARTIFACTS.put(objectKey, JSON.stringify(report), {
		httpMetadata: {
			contentType: "application/json",
		},
	});

	await repositories.decisionReports.create({
		confidence: report.confidence,
		costUsd: report.costUsd,
		id: reportId,
		latencyMs: report.latencyMs,
		objectKey,
		recommendation: report.recommendation,
		report: report as unknown as JsonValue,
		sessionId: report.sessionId,
		summary: report.summary,
		workspaceId: report.workspaceId,
	});
	await appendWorkerEvent(repositories, {
		payload: {
			candidateCount: candidateResults.length,
			recommendation: report.recommendation,
			reportId,
			...(report.winningCandidateId ? { winningCandidateId: report.winningCandidateId } : {}),
		},
		runId: report.synthesis.winningRunId,
		sessionId: orchestration.sessionId,
		type: "report.created",
		workspaceId: orchestration.workspaceId,
	});

	return reportId;
}

async function readDecisionReport(env: RunWorkflowEnv, reportId: string): Promise<DecisionReportDetail | null> {
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	const report = await repositories.decisionReports.findById(reportId);
	if (!report) {
		return null;
	}

	return JSON.parse(report.report_json) as DecisionReportDetail;
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

async function markQueueFinal(
	env: RunWorkflowEnv,
	queueItemId: string,
	reportId: string,
	report: DecisionReportDetail | null,
): Promise<void> {
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	const completed = report && report.recommendation !== "rerun" && report.recommendation !== "reject";
	await transitionQueueItemStatus(repositories, queueItemId, completed ? "completed" : "failed");
	await appendWorkerEvent(repositories, {
		payload: completed
			? { queueItemId, reportId }
			: { error: report?.summary ?? "No acceptable candidate was produced.", queueItemId },
		runId: report?.synthesis.winningRunId,
		sessionId: report?.sessionId,
		type: completed ? "queue.item_completed" : "queue.item_failed",
		workspaceId: report?.workspaceId,
	});
}

async function ensureQueueSession(
	repositories: AgentDeckRepositories,
	workspace: WorkspaceRow,
	queueItem: QueueItemRow,
): Promise<{ id: string; title: string }> {
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
		candidate: AgentCandidate;
		candidateCount: number;
		machineId: string;
		queueItem: QueueItemRow;
		routingStrategy: RoutingStrategy;
		scheduledJobId?: string;
		sessionId: string;
		workspace: WorkspaceRow;
	},
): Promise<RunRow> {
	const runId = runIdForCandidate(input.queueItem.id, input.candidate.id, input.candidateCount);
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
		payload: {
			candidateId: input.candidate.id,
			routingStrategy: input.routingStrategy,
			targetBranch: input.workspace.default_branch,
			task: input.queueItem.task,
		},
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

async function collectHumanInterventions(
	repositories: AgentDeckRepositories,
	candidateResults: readonly CandidateResult[],
): Promise<HumanIntervention[]> {
	const interventions: HumanIntervention[] = [];
	for (const candidate of candidateResults) {
		const approvals = await repositories.approvals.listByRun(candidate.runId, 100);
		for (const approval of approvals) {
			interventions.push({
				description: approval.title,
				timestamp: approval.decided_at ?? approval.created_at,
				type: approval.kind,
			});
		}
	}
	return interventions;
}

async function diffSummaryFromArtifact(env: RunWorkflowEnv, artifact: ArtifactRow): Promise<CandidateDiffSummary> {
	if (artifact.size_bytes > maxPatchSummaryBytes) {
		return {
			additions: 0,
			artifactId: artifact.id,
			deletions: 0,
			filesChanged: 0,
			objectKey: artifact.object_key,
		};
	}

	const object = await env.AGENTDECK_ARTIFACTS.get(artifact.object_key);
	const diff = object ? await object.text() : "";
	const lines = diff.split("\n");
	const filesChanged = lines.filter((line) => line.startsWith("diff --git ")).length;
	const additions = lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
	const deletions = lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
	return {
		additions,
		artifactId: artifact.id,
		deletions,
		filesChanged,
		objectKey: artifact.object_key,
	};
}

function routeOptionsFromSelector(value: JsonValue | null): RouteTaskOptions {
	const model = stringField(value, "model");
	const provider = stringField(value, "provider");
	const requestedStrategy = routingStrategyField(value);
	const maxCandidates = numberField(value, "maxCandidates");
	return {
		...(maxCandidates ? { maxCandidates } : {}),
		...(model ? { model } : {}),
		...(provider ? { provider } : {}),
		...(requestedStrategy ? { requestedStrategy } : {}),
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

function routingStrategyField(value: JsonValue | null): RoutingStrategy | null {
	const strategy = stringField(value, "strategy") ?? stringField(value, "routingStrategy");
	if (
		strategy === "cascade" ||
		strategy === "frontier-fallback" ||
		strategy === "local-only" ||
		strategy === "parallel-candidates" ||
		strategy === "single"
	) {
		return strategy;
	}
	return null;
}

function numberField(value: JsonValue | null, key: string): number | null {
	if (!isRecord(value) || typeof value[key] !== "number" || !Number.isInteger(value[key])) {
		return null;
	}
	return Math.max(1, Math.min(3, value[key]));
}

function stringField(value: JsonValue | null, key: string): string | null {
	return isRecord(value) && typeof value[key] === "string" ? value[key] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function latencyMsFromRow(run: RunRow | null): number | null {
	if (!run?.started_at || !run.completed_at) {
		return null;
	}

	const started = Date.parse(run.started_at);
	const completed = Date.parse(run.completed_at);
	if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
		return null;
	}

	return completed - started;
}

function terminalWorkflowStatus(status: RunStatus): "cancelled" | "completed" | "failed" {
	if (status === "completed" || status === "failed" || status === "cancelled") {
		return status;
	}
	throw new Error(`Unexpected non-terminal run status: ${status}`);
}

function runIdForCandidate(queueItemId: string, candidateId: string, candidateCount: number): string {
	const base = `run_${sanitizeId(queueItemId)}`;
	return candidateCount <= 1 ? base : `${base}_${sanitizeId(candidateId)}`;
}

function sanitizeId(value: string): string {
	return value.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 160);
}
