import type { NextRequest } from "next/server";
import { parseJsonColumn } from "@openfusion/db";

import { requireWorkspaceRow } from "@/lib/api/access";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { assertNonEmptyPatch, parseJsonRequest } from "@/lib/api/request";
import { updatePolicyRuleRequestSchema } from "@/lib/api/schemas";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const body = await parseJsonRequest(request, updatePolicyRuleRequestSchema);
		assertNonEmptyPatch(body);
		const { id } = await params;
		const repositories = await getRepositories();
		const existing = requireWorkspaceRow(await repositories.policyRules.findById(id), user, "Policy rule");
		const policy = await repositories.policyRules.upsert({
			action: body.action ?? existing.action,
			defaultDecision: body.defaultDecision ?? existing.default_decision,
			enabled: body.enabled ?? (existing.enabled === 1),
			id: existing.id,
			matcher: body.matcher ?? parseJsonColumn(existing.matcher_json),
			reason: body.reason ?? existing.reason,
			risk: body.risk ?? existing.risk,
			workspaceId: existing.workspace_id,
		});

		return jsonResponse({ policy });
	});
}
