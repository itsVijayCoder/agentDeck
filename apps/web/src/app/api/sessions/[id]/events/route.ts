import type { NextRequest } from "next/server";

import { requireWorkspaceRow } from "@/lib/api/access";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { parseQuery } from "@/lib/api/request";
import { eventListQuerySchema } from "@/lib/api/schemas";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const query = parseQuery(request, eventListQuerySchema);
		const { id } = await params;
		const repositories = await getRepositories();
		const session = requireWorkspaceRow(await repositories.sessions.findById(id), user, "Session");
		const events = await repositories.events.listBySession(session.id, query.afterSeq, query.limit);

		return jsonResponse({ events });
	});
}
