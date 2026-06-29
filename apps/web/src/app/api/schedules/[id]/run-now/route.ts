import { parseJsonColumn } from "@agentdeck/db";

import { requireWorkspaceRow } from "@/lib/api/access";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth";
import { getRepositories, getRunQueue } from "@/lib/cloudflare-context";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const { id } = await params;
		const repositories = await getRepositories();
		const runQueue = await getRunQueue();
		const schedule = requireWorkspaceRow(await repositories.scheduledJobs.findById(id), user, "Schedule");
		const now = new Date().toISOString();
		const queueItem = await repositories.queue.enqueue({
			agentSelector: parseJsonColumn(schedule.agent_selector_json),
			createdBy: user.userId,
			id: crypto.randomUUID(),
			machineSelector: parseJsonColumn(schedule.machine_selector_json),
			priority: "normal",
			runAfter: now,
			task: schedule.task_template,
			workspaceId: schedule.workspace_id,
		});
		await runQueue.send({
			queueItemId: queueItem.id,
			scheduledJobId: schedule.id,
			type: "queue.item",
		});

		return jsonResponse({ queueItem, schedule }, { status: 201 });
	});
}
