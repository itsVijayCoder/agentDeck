import type { NextRequest } from "next/server";

import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { parseQuery } from "@/lib/api/request";
import { machineListQuerySchema } from "@/lib/api/schemas";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const query = parseQuery(request, machineListQuerySchema);
		const repositories = await getRepositories();
		const machines = await repositories.machines.listByWorkspace(user.workspaceId, query.status, query.limit);

		return jsonResponse({ machines });
	});
}
