import { transitionRunStatus } from "@agentdeck/core";

import { requireWorkspaceRow } from "@/lib/api/access";
import { conflict, jsonResponse, notFound, withApiErrors } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await requireSession();
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

		return jsonResponse({ queueItem });
	});
}
