import { createAgentDeckRepositories } from "@agentdeck/db";
import type { AgentDeckRepositories, JsonValue, QueueItemRow } from "@agentdeck/db";

export type GenerateMorningReportInput = {
	now?: Date;
	workspaceId: string;
};

export type MorningReportResult = {
	objectKey: string;
	reportId: string;
	status: "created" | "exists";
};

export async function generateMorningReport(
	env: Pick<CloudflareEnv, "AGENTDECK_ARTIFACTS" | "AGENTDECK_DB">,
	input: GenerateMorningReportInput,
): Promise<MorningReportResult> {
	const now = input.now ?? new Date();
	const reportDate = now.toISOString().slice(0, 10);
	const reportId = `morning_${input.workspaceId}_${reportDate}`;
	const sessionId = `morning_${input.workspaceId}_${reportDate}`;
	const objectKey = `workspaces/${input.workspaceId}/queue/${reportDate}/morning-summary.md`;
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);

	if (await repositories.decisionReports.findById(reportId)) {
		return { objectKey, reportId, status: "exists" };
	}

	await ensureReportSession(repositories, {
		now,
		sessionId,
		workspaceId: input.workspaceId,
	});

	const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
	const queueItems = await repositories.queue.listByWorkspaceSince(input.workspaceId, since, 1000);
	const markdown = renderMorningReportMarkdown({ now, queueItems });
	const report = buildMorningReportJson({ now, queueItems });

	await env.AGENTDECK_ARTIFACTS.put(objectKey, markdown, {
		httpMetadata: {
			contentType: "text/markdown; charset=utf-8",
		},
	});

	await repositories.decisionReports.create({
		confidence: 1,
		id: reportId,
		objectKey,
		recommendation: report.failed > 0 ? "review-carefully" : report.pending > 0 ? "rerun" : "accept",
		report: report as unknown as JsonValue,
		sessionId,
		summary: `Morning queue report: ${report.completed} completed, ${report.failed} failed, ${report.pending} pending.`,
		workspaceId: input.workspaceId,
	});

	await appendReportCreatedEvent(repositories, {
		reportId,
		sessionId,
		workspaceId: input.workspaceId,
	});

	return { objectKey, reportId, status: "created" };
}

function renderMorningReportMarkdown(input: { now: Date; queueItems: QueueItemRow[] }): string {
	const report = buildMorningReportJson(input);

	return `# AgentDeck Morning Report - ${input.now.toISOString().slice(0, 10)}

## Summary
- Completed: ${report.completed}
- Failed: ${report.failed}
- Pending: ${report.pending}

## Completed Runs
${renderQueueList(report.completedItems)}

## Failed Runs
${renderQueueList(report.failedItems)}

## Pending
${renderQueueList(report.pendingItems)}

Pending approvals should be reviewed in Mission Control before retrying blocked runs.
`;
}

function buildMorningReportJson(input: { now: Date; queueItems: QueueItemRow[] }) {
	const completedItems = input.queueItems.filter((item) => item.status === "completed");
	const failedItems = input.queueItems.filter((item) => item.status === "failed");
	const pendingItems = input.queueItems.filter(
		(item) => item.status === "queued" || item.status === "waiting-machine" || item.status === "waiting-approval",
	);

	return {
		completed: completedItems.length,
		completedItems: completedItems.map(serializeQueueItem),
		failed: failedItems.length,
		failedItems: failedItems.map(serializeQueueItem),
		generatedAt: input.now.toISOString(),
		pending: pendingItems.length,
		pendingItems: pendingItems.map(serializeQueueItem),
		total: input.queueItems.length,
	};
}

function renderQueueList(items: Array<{ id: string; status: string; task: string }>): string {
	if (items.length === 0) {
		return "- None";
	}

	return items.map((item) => `- ${item.task} (${item.status}, ${item.id})`).join("\n");
}

function serializeQueueItem(item: QueueItemRow): { id: string; priority: string; status: string; task: string } {
	return {
		id: item.id,
		priority: item.priority,
		status: item.status,
		task: item.task,
	};
}

async function appendReportCreatedEvent(
	repositories: AgentDeckRepositories,
	input: { reportId: string; sessionId: string; workspaceId: string },
): Promise<void> {
	const seq = await repositories.events.nextSeq(input.sessionId);
	await repositories.events.append({
		event: {
			createdAt: new Date().toISOString(),
			id: crypto.randomUUID(),
			payload: { recommendation: "accept", reportId: input.reportId },
			seq,
			sessionId: input.sessionId,
			source: "worker",
			type: "report.created",
			visibility: "metadata",
			workspaceId: input.workspaceId,
		},
	});
}

async function ensureReportSession(
	repositories: AgentDeckRepositories,
	input: { now: Date; sessionId: string; workspaceId: string },
): Promise<void> {
	if (await repositories.sessions.findById(input.sessionId)) {
		return;
	}

	const workspace = await repositories.workspaces.findById(input.workspaceId);
	if (!workspace) {
		throw new Error(`Workspace ${input.workspaceId} was not found.`);
	}

	const nowIso = input.now.toISOString();
	await repositories.sessions.create({
		createdAt: nowIso,
		createdBy: "scheduler",
		id: input.sessionId,
		privacyMode: workspace.privacy_mode,
		status: "completed",
		title: `Morning report ${nowIso.slice(0, 10)}`,
		updatedAt: nowIso,
		workspaceId: input.workspaceId,
	});
}
