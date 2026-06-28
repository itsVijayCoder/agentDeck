import type { RunStatus } from "@agentdeck/core";
import { transitionRunStatus } from "@agentdeck/core";
import type { JsonValue, AgentDeckRepositories, SessionRow } from "@agentdeck/db";

import { requireWorkspaceRow } from "@/lib/api/access";
import { appendApiEvent, visibilityForPrivacyMode } from "@/lib/api/events";
import { conflict, notFound } from "@/lib/api/errors";
import type { SessionUser } from "@/lib/auth";

export async function transitionSessionStatus(
	repositories: AgentDeckRepositories,
	user: SessionUser,
	sessionId: string,
	nextStatus: RunStatus,
	reason?: string,
): Promise<SessionRow> {
	const session = requireWorkspaceRow(await repositories.sessions.findById(sessionId), user, "Session");
	const transition = transitionRunStatus(session.status, nextStatus);
	if (!transition.ok) {
		conflict(transition.reason);
	}

	const updated = await repositories.sessions.updateStatus(session.id, nextStatus);
	if (!updated) {
		notFound("Session not found.");
	}

	if (nextStatus === "running" || nextStatus === "paused") {
		const type =
			session.status === "paused" && nextStatus === "running"
				? "session.resumed"
				: nextStatus === "paused"
					? "session.paused"
					: "session.started";
		let payload: JsonValue = {};
		if (type === "session.started") {
			payload = { status: nextStatus };
		} else if (reason) {
			payload = { reason };
		}
		await appendApiEvent(repositories, {
			payload,
			sessionId: updated.id,
			type,
			visibility: visibilityForPrivacyMode(updated.privacy_mode),
			workspaceId: updated.workspace_id,
		});
	}

	return updated;
}
