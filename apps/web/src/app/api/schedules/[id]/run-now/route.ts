import { parseJsonColumn } from "@agentdeck/db";

import { auditApiAction } from "@/lib/api/audit";
import { requireWorkspaceRow } from "@/lib/api/access";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { getRepositories, getRunQueue } from "@/lib/cloudflare-context";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("schedule:manage");
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
		await auditApiAction({
			action: "schedule.run_now",
			details: { queueItemId: queueItem.id },
			repositories,
			request,
			resourceId: schedule.id,
			resourceType: "schedule",
			user,
		});

		return jsonResponse({ queueItem, schedule }, { status: 201 });
	});
}
