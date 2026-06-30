import { PermissionDeniedError, requirePermission, type Permission } from "@agentdeck/policy";

import { forbidden } from "@/lib/api/errors";
import { requireSession, type SessionUser } from "@/lib/auth";

export async function authorizeApiRequest(permission: Permission): Promise<SessionUser> {
	const user = await requireSession();
	try {
		requirePermission(user.role, permission);
		return user;
	} catch (error) {
		if (error instanceof PermissionDeniedError) {
			forbidden(error.message);
		}
		throw error;
	}
}

export function assertApiPermission(user: SessionUser, permission: Permission): void {
	try {
		requirePermission(user.role, permission);
	} catch (error) {
		if (error instanceof PermissionDeniedError) {
			forbidden(error.message);
		}
		throw error;
	}
}
