import type { NextRequest } from "next/server";

import { auditApiAction } from "@/lib/api/audit";
import { jsonResponse, notFound, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { getRepositories } from "@/lib/cloudflare-context";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("member:remove");
		const { id } = await params;
		const repositories = await getRepositories();
		const member = await repositories.workspaceMembers.findById(id);
		if (!member || member.workspace_id !== user.workspaceId) {
			notFound("Member not found.");
		}

		await repositories.workspaceMembers.remove(id);
		await auditApiAction({
			action: "member.removed",
			details: { role: member.role, userId: member.user_id },
			repositories,
			request,
			resourceId: id,
			resourceType: "member",
			user,
		});

		return jsonResponse({ ok: true });
	});
}
