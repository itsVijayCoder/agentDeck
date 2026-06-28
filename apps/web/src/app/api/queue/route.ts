import type { NextRequest } from "next/server";

import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { parseJsonRequest, parseQuery } from "@/lib/api/request";
import { createQueueItemRequestSchema, listQuerySchema } from "@/lib/api/schemas";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const query = parseQuery(request, listQuerySchema);
		const repositories = await getRepositories();
		const queueItems = await repositories.queue.listByWorkspace(user.workspaceId, query.status, query.limit);

		return jsonResponse({ queueItems });
	});
}

export async function POST(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const body = await parseJsonRequest(request, createQueueItemRequestSchema);
		const repositories = await getRepositories();
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

		return jsonResponse({ queueItem }, { status: 201 });
	});
}
