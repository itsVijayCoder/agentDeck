import type { NextRequest } from "next/server";

import { requireWorkspaceRow } from "@/lib/api/access";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { parseQuery } from "@/lib/api/request";
import { limitQuerySchema } from "@/lib/api/schemas";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const query = parseQuery(request, limitQuerySchema);
		const { id } = await params;
		const repositories = await getRepositories();
		const session = requireWorkspaceRow(await repositories.sessions.findById(id), user, "Session");
		const artifacts = await repositories.artifacts.listBySession(session.id, query.limit);

		return jsonResponse({ artifacts });
	});
}
