import type { NextRequest } from "next/server";

import { auditApiAction } from "@/lib/api/audit";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { parseJsonRequest, parseQuery } from "@/lib/api/request";
import { inviteMemberRequestSchema, limitQuerySchema } from "@/lib/api/schemas";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("audit:read");
		const query = parseQuery(request, limitQuerySchema);
		const repositories = await getRepositories();
		const members = await repositories.workspaceMembers.listByWorkspace(user.workspaceId, query.limit);

		return jsonResponse({ members });
	});
}

export async function POST(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("member:invite");
		const body = await parseJsonRequest(request, inviteMemberRequestSchema);
		const repositories = await getRepositories();
		const now = new Date().toISOString();
		const invitedUserId = `user_${stableIdFromEmail(body.email)}`;
		const invitedUser = await repositories.users.upsert({
			createdAt: now,
			displayName: body.displayName ?? null,
			email: body.email,
			id: invitedUserId,
			updatedAt: now,
		});
		const member = await repositories.workspaceMembers.upsert({
			createdAt: now,
			id: `member_${crypto.randomUUID()}`,
			invitedAt: now,
			invitedBy: user.userId,
			role: body.role,
			userId: invitedUser.id,
			workspaceId: user.workspaceId,
		});
		await auditApiAction({
			action: "member.invited",
			details: { email: body.email, role: body.role },
			repositories,
			request,
			resourceId: member.id,
			resourceType: "member",
			user,
		});

		return jsonResponse({ member, user: invitedUser }, { status: 201 });
	});
}

function stableIdFromEmail(email: string): string {
	return email.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 80);
}
