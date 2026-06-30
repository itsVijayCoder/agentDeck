import type { NextRequest } from "next/server";
import { transitionRunStatus } from "@agentdeck/core";

import { appendApiEvent, visibilityForPrivacyMode } from "@/lib/api/events";
import { auditApiAction } from "@/lib/api/audit";
import { conflict, jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { parseJsonRequest, parseQuery } from "@/lib/api/request";
import { createQueueItemRequestSchema, listQuerySchema } from "@/lib/api/schemas";
import { getRepositories, getRunQueue } from "@/lib/cloudflare-context";

function shouldSkipCloudflareQueueForLocalDispatch(): boolean {
	return process.env.NODE_ENV === "development" && process.env.AGENTDECK_LOCAL_DISPATCH === "1";
}

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
		const session = body.sessionId ? await repositories.sessions.findById(body.sessionId) : null;
		if (body.sessionId && (!session || session.workspace_id !== user.workspaceId)) {
			conflict("Queue item session does not belong to the current workspace.");
		}
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
			sessionId: session?.id ?? null,
			task: body.task,
			workspaceId: user.workspaceId,
		});
		if (session && session.status !== "queued") {
			const transition = transitionRunStatus(session.status, "queued");
			if (!transition.ok) {
				conflict(transition.reason);
			}
			await repositories.sessions.updateStatus(session.id, "queued");
			await appendApiEvent(repositories, {
				payload: { status: "queued" },
				sessionId: session.id,
				type: "session.started",
				visibility: visibilityForPrivacyMode(session.privacy_mode),
				workspaceId: user.workspaceId,
			});
		}
		if (session) {
			await appendApiEvent(repositories, {
				payload: { priority: queueItem.priority, queueItemId: queueItem.id },
				sessionId: session.id,
				type: "queue.item_created",
				visibility: visibilityForPrivacyMode(session.privacy_mode),
				workspaceId: user.workspaceId,
			});
		}
		if (!shouldSkipCloudflareQueueForLocalDispatch()) {
			const runQueue = await getRunQueue();
			await runQueue.send({
				queueItemId: queueItem.id,
				type: "queue.item",
			});
		}
		await auditApiAction({
			action: "queue.item_created",
			details: { priority: queueItem.priority, sessionId: queueItem.session_id, task: queueItem.task },
			repositories,
			request,
			resourceId: queueItem.id,
			resourceType: "queue-item",
			user,
		});

		return jsonResponse({ queueItem }, { status: 201 });
	});
}
