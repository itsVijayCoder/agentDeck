import type { NextRequest } from "next/server";

import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { parseOptionalJsonRequest } from "@/lib/api/request";
import { sessionActionRequestSchema } from "@/lib/api/schemas";
import { transitionSessionStatus } from "@/lib/api/session-state";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const body = await parseOptionalJsonRequest(request, sessionActionRequestSchema);
		const { id } = await params;
		const repositories = await getRepositories();
		const session = await transitionSessionStatus(repositories, user, id, "paused", body.reason);

		return jsonResponse({ session });
	});
}
