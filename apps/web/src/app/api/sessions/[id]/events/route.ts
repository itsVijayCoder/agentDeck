import type { NextRequest } from "next/server";

import { requireWorkspaceRow } from "@/lib/api/access";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { parseQuery } from "@/lib/api/request";
import { eventListQuerySchema } from "@/lib/api/schemas";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("session:read");
		const query = parseQuery(request, eventListQuerySchema);
		const { id } = await params;
		const repositories = await getRepositories();
		const session = requireWorkspaceRow(await repositories.sessions.findById(id), user, "Session");
		const events = await repositories.events.listBySession(session.id, query.afterSeq, query.limit);

		return jsonResponse({ events });
	});
}
