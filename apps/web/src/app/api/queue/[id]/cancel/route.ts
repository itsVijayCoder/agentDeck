import { transitionRunStatus } from "@agentdeck/core";

import { auditApiAction } from "@/lib/api/audit";
import { requireWorkspaceRow } from "@/lib/api/access";
import { conflict, jsonResponse, notFound, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { getRepositories } from "@/lib/cloudflare-context";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("queue:manage");
		const { id } = await params;
		const repositories = await getRepositories();
		const existing = requireWorkspaceRow(await repositories.queue.findById(id), user, "Queue item");
		const transition = transitionRunStatus(existing.status, "cancelled");
		if (!transition.ok) {
			conflict(transition.reason);
		}

		const queueItem = await repositories.queue.cancel(existing.id);
		if (!queueItem) {
			notFound("Queue item not found.");
		}
		await auditApiAction({
			action: "queue.item_cancelled",
			details: { previousStatus: existing.status },
			repositories,
			request,
			resourceId: queueItem.id,
			resourceType: "queue-item",
			user,
		});

		return jsonResponse({ queueItem });
	});
}
