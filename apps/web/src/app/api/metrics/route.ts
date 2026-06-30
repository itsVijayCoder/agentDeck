import type { NextRequest } from "next/server";

import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { parseQuery } from "@/lib/api/request";
import { metricsQuerySchema } from "@/lib/api/schemas";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("session:read");
		const query = parseQuery(request, metricsQuerySchema);
		const repositories = await getRepositories();
		const metricSnapshots = await repositories.metricSnapshots.listByWorkspace(
			user.workspaceId,
			query.from,
			query.to,
			query.limit,
		);

		return jsonResponse({ metricSnapshots });
	});
}
