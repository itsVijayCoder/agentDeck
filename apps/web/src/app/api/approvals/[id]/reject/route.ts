import type { NextRequest } from "next/server";

import { auditApiAction } from "@/lib/api/audit";
import { decideApproval } from "@/lib/api/approval-state";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { parseOptionalJsonRequest } from "@/lib/api/request";
import { approvalDecisionRequestSchema } from "@/lib/api/schemas";
import { getRepositories } from "@/lib/cloudflare-context";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("approval:decide");
		const body = await parseOptionalJsonRequest(request, approvalDecisionRequestSchema);
		const { id } = await params;
		const repositories = await getRepositories();
		const decision = body.decision ?? (body.notes ? { notes: body.notes } : null);
		const approval = await decideApproval(repositories, user, id, "rejected", decision, body.notes);
		await auditApiAction({
			action: "approval.decided",
			details: { notes: body.notes ?? null, status: "rejected" },
			repositories,
			request,
			resourceId: approval.id,
			resourceType: "approval",
			user,
		});

		return jsonResponse({ approval });
	});
}
