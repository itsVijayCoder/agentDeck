import type { NextRequest } from "next/server";

import { decideApproval } from "@/lib/api/approval-state";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { parseOptionalJsonRequest } from "@/lib/api/request";
import { approvalDecisionRequestSchema } from "@/lib/api/schemas";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const body = await parseOptionalJsonRequest(request, approvalDecisionRequestSchema);
		const { id } = await params;
		const repositories = await getRepositories();
		const decision = body.decision ?? (body.notes ? { notes: body.notes } : null);
		const approval = await decideApproval(repositories, user, id, "rejected", decision, body.notes);

		return jsonResponse({ approval });
	});
}
