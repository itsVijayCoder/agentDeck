import type { NextRequest } from "next/server";

import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { parseQuery } from "@/lib/api/request";
import { approvalListQuerySchema } from "@/lib/api/schemas";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("session:read");
		const query = parseQuery(request, approvalListQuerySchema);
		const repositories = await getRepositories();
		const approvals = await repositories.approvals.listByWorkspace(user.workspaceId, query.status, query.limit);

		return jsonResponse({ approvals });
	});
}
