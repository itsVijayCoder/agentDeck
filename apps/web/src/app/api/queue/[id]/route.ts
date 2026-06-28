import type { NextRequest } from "next/server";
import { transitionRunStatus } from "@openfusion/core";

import { requireWorkspaceRow } from "@/lib/api/access";
import { conflict, jsonResponse, notFound, withApiErrors } from "@/lib/api/errors";
import { assertNonEmptyPatch, parseJsonRequest } from "@/lib/api/request";
import { updateQueueItemRequestSchema } from "@/lib/api/schemas";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const body = await parseJsonRequest(request, updateQueueItemRequestSchema);
		assertNonEmptyPatch(body);
		const { id } = await params;
		const repositories = await getRepositories();
		const existing = requireWorkspaceRow(await repositories.queue.findById(id), user, "Queue item");

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
			status: body.status,
		});
		if (!queueItem) {
			notFound("Queue item not found.");
		}

		return jsonResponse({ queueItem });
	});
}
