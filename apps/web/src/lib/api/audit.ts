import type { AgentDeckRepositories, AuditAction, JsonValue } from "@agentdeck/db";
import { writeAudit } from "@agentdeck/db";

import type { SessionUser } from "@/lib/auth";

export async function auditApiAction(input: {
	action: AuditAction;
	details?: JsonValue | null;
	repositories: AgentDeckRepositories;
	request?: Request;
	resourceId?: string | null;
	resourceType: string;
	user: SessionUser;
}): Promise<void> {
	await writeAudit(input.repositories, {
		action: input.action,
		actorId: input.user.userId,
		details: input.details,
		ipAddress: input.request?.headers.get("cf-connecting-ip") ?? input.request?.headers.get("x-forwarded-for") ?? null,
		resourceId: input.resourceId,
		resourceType: input.resourceType,
		userAgent: input.request?.headers.get("user-agent") ?? null,
		workspaceId: input.user.workspaceId,
	});
}
