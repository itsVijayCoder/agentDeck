import type { NextRequest } from "next/server";
import { isSessionHubClientRole } from "@agentdeck/bridge-protocol";

import { requireWorkspaceRow } from "@/lib/api/access";
import { badRequest, forbidden, jsonResponse, notFound, unauthorized, withApiErrors } from "@/lib/api/errors";
import { assertApiPermission } from "@/lib/api/permissions";
import { requireSession, verifyBridgeConnectionToken } from "@/lib/auth";
import { getRepositories, getSessionHub } from "@/lib/cloudflare-context";
import { SESSION_HUB_HEADERS } from "@/do/session-hub-protocol";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return jsonResponse({ code: "BAD_REQUEST", error: "Expected a WebSocket upgrade request." }, { status: 426 });
		}

		const { id } = await params;
		const role = request.nextUrl.searchParams.get("role");
		if (!isSessionHubClientRole(role)) {
			badRequest("Invalid or missing SessionHub role.");
		}

		const repositories = await getRepositories();
		const session = await repositories.sessions.findById(id);
		if (!session) {
			notFound("Session not found.");
		}

		const headers = new Headers(request.headers);
		headers.set(SESSION_HUB_HEADERS.clientRole, role);
		headers.set(SESSION_HUB_HEADERS.sessionId, session.id);
		headers.set(SESSION_HUB_HEADERS.workspaceId, session.workspace_id);

		if (role === "bridge") {
			await authorizeBridge(request, session.workspace_id, headers);
		} else {
			const user = await requireSession();
			assertApiPermission(user, "session:read");
			requireWorkspaceRow(session, user, "Session");
			headers.set(SESSION_HUB_HEADERS.userId, user.userId);
		}

		const sessionHub = await getSessionHub();
		const stub = sessionHub.getByName(session.id);
		return stub.fetch(
			new Request(request.url, {
				headers,
				method: "GET",
			}),
		);
	});
}

async function authorizeBridge(request: NextRequest, workspaceId: string, headers: Headers): Promise<void> {
	const token = request.nextUrl.searchParams.get("token");
	const machineId = request.nextUrl.searchParams.get("machineId");
	if (!token || !machineId) {
		unauthorized("Bridge WebSocket connections require a machine id and token.");
	}

	const payload = await verifyBridgeConnectionToken(token);
	if (!payload || payload.machineId !== machineId || payload.workspaceId !== workspaceId) {
		unauthorized("Bridge token is invalid or expired.");
	}

	const repositories = await getRepositories();
	const machine = await repositories.machines.findById(machineId);
	if (!machine) {
		notFound("Machine not found.");
	}
	if (machine.workspace_id !== workspaceId) {
		forbidden();
	}
	if (machine.status === "revoked") {
		forbidden("Machine has been revoked.");
	}

	headers.set(SESSION_HUB_HEADERS.machineId, machine.id);
}
