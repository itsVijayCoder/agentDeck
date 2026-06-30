import type { AgentDeckRepositories, QueryableD1 } from "./repositories";
import { createAgentDeckRepositories } from "./repositories";
import type { AuditAction, AuditLogRow, JsonValue } from "./types/agentdeck-db";

export type AuditEntryInput = {
	action: AuditAction;
	actorId?: string | null;
	details?: JsonValue | null;
	ipAddress?: string | null;
	resourceId?: string | null;
	resourceType: string;
	userAgent?: string | null;
	workspaceId: string;
};

export async function writeAudit(
	target: AgentDeckRepositories | QueryableD1,
	entry: AuditEntryInput,
): Promise<AuditLogRow> {
	const repositories = isRepositories(target) ? target : createAgentDeckRepositories(target);
	return repositories.auditLog.create(entry);
}

function isRepositories(value: AgentDeckRepositories | QueryableD1): value is AgentDeckRepositories {
	return "auditLog" in value;
}
