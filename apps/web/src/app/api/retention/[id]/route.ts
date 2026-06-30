import type { NextRequest } from "next/server";

import { auditApiAction } from "@/lib/api/audit";
import { jsonResponse, notFound, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { assertNonEmptyPatch, parseOptionalJsonRequest } from "@/lib/api/request";
import { updateRetentionPolicyRequestSchema } from "@/lib/api/schemas";
import { getRepositories } from "@/lib/cloudflare-context";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("policy:manage");
		const body = await parseOptionalJsonRequest(request, updateRetentionPolicyRequestSchema);
		assertNonEmptyPatch(body);
		const { id } = await params;
		const repositories = await getRepositories();
		const existing = await repositories.retentionPolicies.findById(id);
		if (!existing || existing.workspace_id !== user.workspaceId) {
			notFound("Retention policy not found.");
		}

		const retentionPolicy = await repositories.retentionPolicies.upsert({
			action: body.action ?? existing.action,
			id: existing.id,
			resourceType: body.resourceType ?? existing.resource_type,
			retentionDays: body.retentionDays ?? existing.retention_days,
			workspaceId: user.workspaceId,
		});
		await auditApiAction({
			action: "retention.updated",
			details: {
				action: retentionPolicy.action,
				resourceType: retentionPolicy.resource_type,
				retentionDays: retentionPolicy.retention_days,
			},
			repositories,
			request,
			resourceId: retentionPolicy.id,
			resourceType: "retention-policy",
			user,
		});

		return jsonResponse({ retentionPolicy });
	});
}
