import type { NextRequest } from "next/server";
import { transitionRunStatus } from "@agentdeck/core";

import { requireWorkspaceRow } from "@/lib/api/access";
import { conflict, jsonResponse, notFound, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { assertNonEmptyPatch, parseJsonRequest } from "@/lib/api/request";
import { updateQueueItemRequestSchema } from "@/lib/api/schemas";
import { getRepositories } from "@/lib/cloudflare-context";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("queue:manage");
		const body = await parseJsonRequest(request, updateQueueItemRequestSchema);
		assertNonEmptyPatch(body);
		const { id } = await params;
		const repositories = await getRepositories();
		const existing = requireWorkspaceRow(await repositories.queue.findById(id), user, "Queue item");
		if (body.sessionId) {
			const session = requireWorkspaceRow(await repositories.sessions.findById(body.sessionId), user, "Session");
			if (session.workspace_id !== existing.workspace_id) {
				conflict("Queue item session does not belong to the current workspace.");
			}
		}

		if (body.status) {
			const transition = transitionRunStatus(existing.status, body.status);
			if (!transition.ok) {
				conflict(transition.reason);
			}
		}

		const queueItem = await repositories.queue.update({
			agentSelector: body.agentSelector,
			id: existing.id,
			machineSelector: body.machineSelector,
			maxCostUsd: body.maxCostUsd,
			maxRuntimeMinutes: body.maxRuntimeMinutes,
			priority: body.priority,
			runAfter: body.runAfter,
			scheduleWindow: body.scheduleWindow,
			sessionId: body.sessionId,
			status: body.status,
		});
		if (!queueItem) {
			notFound("Queue item not found.");
		}

		return jsonResponse({ queueItem });
	});
}
