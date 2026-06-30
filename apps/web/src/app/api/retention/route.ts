import type { NextRequest } from "next/server";

import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { parseQuery } from "@/lib/api/request";
import { limitQuerySchema } from "@/lib/api/schemas";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("audit:read");
		const query = parseQuery(request, limitQuerySchema);
		const repositories = await getRepositories();
		const retentionPolicies = await repositories.retentionPolicies.listByWorkspace(user.workspaceId, query.limit);

		return jsonResponse({ retentionPolicies });
	});
}
