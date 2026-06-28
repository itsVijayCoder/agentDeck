import type { NextRequest } from "next/server";

import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { parseJsonRequest } from "@/lib/api/request";
import { createWorkspaceRequestSchema } from "@/lib/api/schemas";
import { createSession as createBrowserSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function POST(request: NextRequest) {
	return withApiErrors(async () => {
		const body = await parseJsonRequest(request, createWorkspaceRequestSchema);
		const repositories = await getRepositories();
		const workspace = await repositories.workspaces.create({
			defaultBranch: body.defaultBranch,
			id: crypto.randomUUID(),
			name: body.name,
			privacyMode: body.privacyMode,
			repositoryUrl: body.repositoryUrl,
		});
		const user = {
			role: "owner" as const,
			userId: `user_${crypto.randomUUID()}`,
			workspaceId: workspace.id,
		};

		await createBrowserSession(user);

		return jsonResponse({ user, workspace }, { status: 201 });
	});
}
