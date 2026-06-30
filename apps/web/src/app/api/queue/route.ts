import type { NextRequest } from "next/server";

import { auditApiAction } from "@/lib/api/audit";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { parseJsonRequest, parseQuery } from "@/lib/api/request";
import { createQueueItemRequestSchema, listQuerySchema } from "@/lib/api/schemas";
import { getRepositories, getRunQueue } from "@/lib/cloudflare-context";

export async function GET(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("session:read");
		const query = parseQuery(request, listQuerySchema);
		const repositories = await getRepositories();
		const queueItems = await repositories.queue.listByWorkspace(user.workspaceId, query.status, query.limit);

		return jsonResponse({ queueItems });
	});
}

export async function POST(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("queue:manage");
		const body = await parseJsonRequest(request, createQueueItemRequestSchema);
		const repositories = await getRepositories();
		const runQueue = await getRunQueue();
		const queueItem = await repositories.queue.enqueue({
			agentSelector: body.agentSelector,
			createdBy: user.userId,
			id: crypto.randomUUID(),
			machineSelector: body.machineSelector,
			maxCostUsd: body.maxCostUsd,
			maxRuntimeMinutes: body.maxRuntimeMinutes,
			priority: body.priority,
			runAfter: body.runAfter,
			scheduleWindow: body.scheduleWindow,
			task: body.task,
			workspaceId: user.workspaceId,
		});
		await runQueue.send({
			queueItemId: queueItem.id,
			type: "queue.item",
		});
		await auditApiAction({
			action: "queue.item_created",
			details: { priority: queueItem.priority, task: queueItem.task },
			repositories,
			request,
			resourceId: queueItem.id,
			resourceType: "queue-item",
			user,
		});

		return jsonResponse({ queueItem }, { status: 201 });
	});
}
