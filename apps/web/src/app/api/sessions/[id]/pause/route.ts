import type { NextRequest } from "next/server";

import { auditApiAction } from "@/lib/api/audit";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { parseOptionalJsonRequest } from "@/lib/api/request";
import { sessionActionRequestSchema } from "@/lib/api/schemas";
import { transitionSessionStatus } from "@/lib/api/session-state";
import { getRepositories } from "@/lib/cloudflare-context";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("session:control");
		const body = await parseOptionalJsonRequest(request, sessionActionRequestSchema);
		const { id } = await params;
		const repositories = await getRepositories();
		const session = await transitionSessionStatus(repositories, user, id, "paused", body.reason);
		await auditApiAction({
			action: "session.paused",
			details: body.reason ? { reason: body.reason } : null,
			repositories,
			request,
			resourceId: session.id,
			resourceType: "session",
			user,
		});

		return jsonResponse({ session });
	});
}
