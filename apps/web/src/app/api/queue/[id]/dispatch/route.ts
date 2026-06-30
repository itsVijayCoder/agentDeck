import type { NextRequest } from "next/server";

import { auditApiAction } from "@/lib/api/audit";
import { requireWorkspaceRow } from "@/lib/api/access";
import { forbidden, jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { getLocalDispatchBindings, getRepositories } from "@/lib/cloudflare-context";
import { dispatchQueueItemLocally } from "@/lib/api/local-dispatch";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		if (process.env.NODE_ENV !== "development" || process.env.AGENTDECK_LOCAL_DISPATCH !== "1") {
			forbidden("Local queue dispatch is only available in development with AGENTDECK_LOCAL_DISPATCH=1.");
		}

		const user = await authorizeApiRequest("queue:manage");
		const { id } = await params;
		const repositories = await getRepositories();
		const queueItem = requireWorkspaceRow(await repositories.queue.findById(id), user, "Queue item");
		const env = await getLocalDispatchBindings();
		const result = await dispatchQueueItemLocally(env, queueItem.id);

		await auditApiAction({
			action: "queue.item_dispatched",
			details: result,
			repositories,
			request,
			resourceId: queueItem.id,
			resourceType: "queue-item",
			user,
		});

		return jsonResponse(result, { status: result.accepted ? 202 : 409 });
	});
}
