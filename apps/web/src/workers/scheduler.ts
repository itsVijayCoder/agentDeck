import { createAgentDeckRepositories, parseJsonColumn } from "@agentdeck/db";
import type { AgentDeckRepositories, ScheduledJobRow } from "@agentdeck/db";

import { type AgentDeckQueueMessage } from "@/lib/phase-08-contracts";
import { calculateNextRun, shouldGenerateMorningReport } from "@/lib/schedule-parser";
import { generateMorningReport } from "./morning-report";

export type SchedulerEnv = {
	AGENTDECK_ARTIFACTS: R2Bucket;
	AGENTDECK_DB: D1Database;
	AGENTDECK_QUEUE: Queue<AgentDeckQueueMessage>;
};

export type SchedulerResult = {
	dueJobs: number;
	enqueued: number;
	morningReports: number;
};

export async function runScheduler(env: SchedulerEnv, now = new Date()): Promise<SchedulerResult> {
	const repositories = createAgentDeckRepositories(env.AGENTDECK_DB);
	const dueJobs = await repositories.scheduledJobs.listDue(now.toISOString(), 100);
	let enqueued = 0;

	for (const job of dueJobs) {
		const queued = await enqueueScheduledJob({ env, job, now, repositories });
		if (queued) {
			enqueued += 1;
		}
	}

	const morningReports = shouldGenerateMorningReport(now, "UTC")
		? await generateWorkspaceMorningReports(env, repositories, now)
		: 0;

	return {
		dueJobs: dueJobs.length,
		enqueued,
		morningReports,
	};
}

async function enqueueScheduledJob(input: {
	env: SchedulerEnv;
	job: ScheduledJobRow;
	now: Date;
	repositories: AgentDeckRepositories;
}): Promise<boolean> {
	const runAfter = input.job.next_run_at ?? input.now.toISOString();
	const queueItemId = buildScheduledQueueItemId(input.job.id, runAfter);
	const existingQueueItem = await input.repositories.queue.findById(queueItemId);
	const queueItem =
		existingQueueItem ??
		(await input.repositories.queue.enqueue({
			agentSelector: parseJsonColumn(input.job.agent_selector_json),
			createdBy: "scheduler",
			id: queueItemId,
			machineSelector: parseJsonColumn(input.job.machine_selector_json),
			priority: "normal",
			runAfter,
			task: input.job.task_template,
			workspaceId: input.job.workspace_id,
		}));

	await input.env.AGENTDECK_QUEUE.send({
		queueItemId: queueItem.id,
		scheduledJobId: input.job.id,
		type: "queue.item",
	});

	await input.repositories.scheduledJobs.upsert({
		agentSelector: parseJsonColumn(input.job.agent_selector_json),
		cron: input.job.cron,
		enabled: input.job.enabled === 1,
		id: input.job.id,
		lastRunAt: input.now.toISOString(),
		lastStatus: "success",
		machineSelector: parseJsonColumn(input.job.machine_selector_json),
		name: input.job.name,
		naturalLanguage: input.job.natural_language,
		nextRunAt: calculateNextRun(input.job.cron, input.job.timezone, input.now),
		taskTemplate: input.job.task_template,
		timezone: input.job.timezone,
		workspaceId: input.job.workspace_id,
	});

	return true;
}

async function generateWorkspaceMorningReports(
	env: SchedulerEnv,
	repositories: AgentDeckRepositories,
	now: Date,
): Promise<number> {
	const workspaces = await repositories.workspaces.list(200);
	let created = 0;
	for (const workspace of workspaces) {
		const result = await generateMorningReport(env, {
			now,
			workspaceId: workspace.id,
		});
		if (result.status === "created") {
			created += 1;
		}
	}
	return created;
}

function buildScheduledQueueItemId(scheduleId: string, runAfter: string): string {
	return `queue_${sanitizeId(scheduleId)}_${sanitizeId(runAfter)}`.slice(0, 160);
}

function sanitizeId(value: string): string {
	return value.replace(/[^A-Za-z0-9_-]/gu, "_");
}
