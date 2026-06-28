import type { NextRequest } from "next/server";

import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { parseQuery } from "@/lib/api/request";
import { limitQuerySchema } from "@/lib/api/schemas";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const query = parseQuery(request, limitQuerySchema);
		const repositories = await getRepositories();
		const reports = await repositories.decisionReports.listByWorkspace(user.workspaceId, query.limit);

		return jsonResponse({ reports });
	});
}
