import type { ApprovalStatus } from "@agentdeck/core";
import { transitionApprovalStatus } from "@agentdeck/core";
import type { ApprovalRow, JsonValue, AgentDeckRepositories } from "@agentdeck/db";

import { requireWorkspaceRow } from "@/lib/api/access";
import { appendApiEvent } from "@/lib/api/events";
import { conflict, notFound } from "@/lib/api/errors";
import type { SessionUser } from "@/lib/auth";

export async function decideApproval(
	repositories: AgentDeckRepositories,
	user: SessionUser,
	approvalId: string,
	status: Extract<ApprovalStatus, "approved" | "rejected">,
	decision: JsonValue | null,
	reason?: string,
): Promise<ApprovalRow> {
	const approval = requireWorkspaceRow(await repositories.approvals.findById(approvalId), user, "Approval");
	const transition = transitionApprovalStatus(approval.status, status);
	if (!transition.ok) {
		conflict(transition.reason);
	}

	const updated = await repositories.approvals.decide({
		decidedBy: user.userId,
		decision,
		id: approval.id,
		status,
	});
	if (!updated) {
		notFound("Approval not found.");
	}

	await appendApiEvent(repositories, {
		payload:
			status === "approved"
				? { approvalId: approval.id, decidedBy: user.userId, status }
				: reason
					? { approvalId: approval.id, decidedBy: user.userId, reason }
					: { approvalId: approval.id, decidedBy: user.userId },
		runId: approval.run_id,
		sessionId: approval.session_id,
		type: status === "approved" ? "approval.approved" : "approval.rejected",
		visibility: "metadata",
		workspaceId: approval.workspace_id,
	});

	return updated;
}
