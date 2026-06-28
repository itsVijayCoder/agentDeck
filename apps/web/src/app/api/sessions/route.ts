import type { NextRequest } from "next/server";

import { appendApiEvent, visibilityForPrivacyMode } from "@/lib/api/events";
import { jsonResponse, notFound, withApiErrors } from "@/lib/api/errors";
import { parseJsonRequest, parseQuery } from "@/lib/api/request";
import { createSessionRequestSchema, listQuerySchema } from "@/lib/api/schemas";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const query = parseQuery(request, listQuerySchema);
		const repositories = await getRepositories();
		const sessions = await repositories.sessions.listByWorkspace(user.workspaceId, query.status, query.limit);

		return jsonResponse({ sessions });
	});
}

export async function POST(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const body = await parseJsonRequest(request, createSessionRequestSchema);
		const repositories = await getRepositories();
		const workspace = await repositories.workspaces.findById(user.workspaceId);
		if (!workspace) {
			notFound("Workspace not found.");
		}

		const privacyMode = body.privacyMode ?? workspace.privacy_mode;
		const session = await repositories.sessions.create({
			createdBy: user.userId,
			id: crypto.randomUUID(),
			parentSessionId: body.parentSessionId,
			privacyMode,
			title: body.title,
			workspaceId: user.workspaceId,
		});

		await appendApiEvent(repositories, {
			payload: { privacyMode, title: session.title },
			sessionId: session.id,
			type: "session.created",
			visibility: visibilityForPrivacyMode(privacyMode),
			workspaceId: user.workspaceId,
		});

		return jsonResponse({ session }, { status: 201 });
	});
}
