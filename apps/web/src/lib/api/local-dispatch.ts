import type { AgentKind, PrivacyMode, RunDispatchControlMessage, RunStatus } from "@agentdeck/core";
import { transitionRunStatus } from "@agentdeck/core";
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

export type LocalDispatchEnv = {
	AGENTDECK_DB: D1Database;
	SESSION_HUB: DurableObjectNamespace<SessionHub>;
};

export type LocalDispatchResult =
	| { accepted: true; bridgeCount: number; runIds: string[]; sessionId: string; status: "running" }
	| { accepted: false; reason: string; runIds: string[]; sessionId?: string; status: "queued" | "waiting-machine" };

type DispatchTarget = {
	agentInstallation: AgentInstallationRow;
	machine: MachineRow;
	privacyMode: PrivacyMode;
	queueItem: QueueItemRow;
	run: RunRow;
	sessionId: string;
	targetBranch: string;
	workspaceId: string;
};

export async function dispatchQueueItemLocally(env: LocalDispatchEnv, queueItemId: string): Promise<LocalDispatchResult> {
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	const queueItem = await repositories.queue.findById(queueItemId);
	if (!queueItem) {
		return { accepted: false, reason: "Queue item not found.", runIds: [], status: "queued" };
	}

	const workspace = await repositories.workspaces.findById(queueItem.workspace_id);
	if (!workspace) {
		return { accepted: false, reason: "Workspace not found.", runIds: [], status: "queued" };
	}

	const target = await prepareSingleTarget(repositories, workspace, queueItem);
	if (!target) {
		await transitionQueueItemStatus(repositories, queueItem.id, "waiting-machine");
		return { accepted: false, reason: "No online bridge agent matched this queue item.", runIds: [], status: "waiting-machine" };
	}

	const dispatch = await dispatchRun(env, target);
	if (!dispatch.accepted) {
		await transitionQueueItemStatus(repositories, queueItem.id, "waiting-machine");
		await transitionRunToStatus(repositories, target.run.id, "waiting-machine");
		return {
			accepted: false,
			reason: dispatch.reason,
			runIds: [target.run.id],
			sessionId: target.sessionId,
			status: "waiting-machine",
		};
	}

	await transitionQueueItemStatus(repositories, queueItem.id, "running");
	await transitionRunToStatus(repositories, target.run.id, "running");
	await appendDispatchEvent(repositories, target);
	return {
		accepted: true,
		bridgeCount: dispatch.bridgeCount,
		runIds: [target.run.id],
		sessionId: target.sessionId,
		status: "running",
	};
}

async function prepareSingleTarget(
	repositories: AgentDeckRepositories,
	workspace: WorkspaceRow,
	queueItem: QueueItemRow,
): Promise<DispatchTarget | null> {
	const sessionId = await ensureQueueSession(repositories, workspace, queueItem);
	const requestedAgentKind = agentKindField(parseNullableJsonColumn(queueItem.agent_selector_json));
	const requestedMachineId =
		stringField(parseNullableJsonColumn(queueItem.machine_selector_json), "machineId") ??
		stringField(parseNullableJsonColumn(queueItem.machine_selector_json), "id");
	const machines = await repositories.machines.listByWorkspace(queueItem.workspace_id, "online", 50);

	for (const machine of machines) {
		if (requestedMachineId && machine.id !== requestedMachineId) {
			continue;
		}
		const installations = await repositories.agentInstallations.listByMachine(machine.id);
		const agentInstallation = installations.find(
			(agent) =>
				(!requestedAgentKind || agent.agent_kind === requestedAgentKind) &&
				agent.auth_status !== "missing" &&
				agent.auth_status !== "expired",
		);
		if (!agentInstallation) {
			continue;
		}

		const run = await ensureQueueRun(repositories, {
			agentInstallation,
			machine,
			queueItem,
			sessionId,
			workspace,
		});
		return {
			agentInstallation,
			machine,
			privacyMode: workspace.privacy_mode,
			queueItem,
			run,
			sessionId,
			targetBranch: workspace.default_branch,
			workspaceId: workspace.id,
		};
	}

	return null;
}

async function dispatchRun(
	env: LocalDispatchEnv,
	target: DispatchTarget,
): Promise<{ accepted: true; bridgeCount: number } | { accepted: false; reason: string }> {
	const message: RunDispatchControlMessage = runDispatchControlMessageSchema.parse({
		agentInstallationId: target.agentInstallation.id,
		agentKind: target.agentInstallation.agent_kind,
		candidateId: "local",
		candidateLabel: "Local dispatch",
		machineId: target.machine.id,
		privacyMode: target.privacyMode,
		queueItemId: target.queueItem.id,
		runId: target.run.id,
		routingStrategy: "single",
		sessionId: target.sessionId,
		targetBranch: target.targetBranch,
		task: target.queueItem.task,
		type: "run.dispatch",
		worktreeBranch: target.run.branch_name ?? `agentdeck/${sanitizeId(target.queueItem.id)}`,
		workspaceId: target.workspaceId,
	});
	const stub = env.SESSION_HUB.getByName(target.sessionId);
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

async function ensureQueueSession(
	repositories: AgentDeckRepositories,
	workspace: WorkspaceRow,
	queueItem: QueueItemRow,
): Promise<string> {
	if (queueItem.session_id) {
		const linked = await repositories.sessions.findById(queueItem.session_id);
		if (linked) {
			if (linked.status === "draft") {
				await repositories.sessions.updateStatus(linked.id, "queued");
			}
			return linked.id;
		}
	}

	const sessionId = `queue_${sanitizeId(queueItem.id)}`;
	const existing = await repositories.sessions.findById(sessionId);
	if (existing) {
		return existing.id;
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
	await repositories.queue.update({ id: queueItem.id, sessionId: session.id });
	return session.id;
}

async function ensureQueueRun(
	repositories: AgentDeckRepositories,
	input: {
		agentInstallation: AgentInstallationRow;
		machine: MachineRow;
		queueItem: QueueItemRow;
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
	const branchName = `agentdeck/${sanitizeId(input.queueItem.id)}`;
	return repositories.runs.create({
		agentInstallationId: input.agentInstallation.id,
		branchName,
		createdAt: now,
		id: runId,
		machineId: input.machine.id,
		queueItemId: input.queueItem.id,
		sessionId: input.sessionId,
		status: "queued",
		task: input.queueItem.task,
		updatedAt: now,
	});
}

async function appendDispatchEvent(repositories: AgentDeckRepositories, target: DispatchTarget): Promise<void> {
	const seq = await repositories.events.nextSeq(target.sessionId);
	await repositories.events.append({
		event: {
			createdAt: new Date().toISOString(),
			id: crypto.randomUUID(),
			payload: {
				agentInstallationId: target.agentInstallation.id,
				candidateId: "local",
				machineId: target.machine.id,
			},
			runId: target.run.id,
			seq,
			sessionId: target.sessionId,
			source: "worker",
			type: "run.dispatched",
			visibility: "metadata",
			workspaceId: target.workspaceId,
		},
	});
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

	await repositories.queue.update({ id: queueItemId, status: nextStatus });
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
		id: runId,
		startedAt: nextStatus === "running" ? new Date().toISOString() : undefined,
		status: nextStatus,
	});
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
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return null;
	}
	const record = value as Record<string, JsonValue>;
	const field = record[key];
	return typeof field === "string" ? field : null;
}

function sanitizeId(value: string): string {
	return value.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 160);
}
