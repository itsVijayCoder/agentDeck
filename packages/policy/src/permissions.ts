export type Role = "member" | "observer" | "owner";

export type Permission =
	| "session:create"
	| "session:read"
	| "session:control"
	| "terminal:jump-in"
	| "approval:decide"
	| "queue:manage"
	| "schedule:manage"
	| "policy:manage"
	| "machine:manage"
	| "member:invite"
	| "member:remove"
	| "audit:read"
	| "report:export";

export class PermissionDeniedError extends Error {
	constructor(
		readonly role: Role,
		readonly permission: Permission,
	) {
		super(`Role ${role} does not have permission ${permission}.`);
		this.name = "PermissionDeniedError";
	}
}

const rolePermissions: Record<Role, readonly Permission[]> = {
	member: [
		"session:create",
		"session:read",
		"session:control",
		"terminal:jump-in",
		"approval:decide",
		"queue:manage",
		"report:export",
	],
	observer: ["session:read", "audit:read"],
	owner: [
		"session:create",
		"session:read",
		"session:control",
		"terminal:jump-in",
		"approval:decide",
		"queue:manage",
		"schedule:manage",
		"policy:manage",
		"machine:manage",
		"member:invite",
		"member:remove",
		"audit:read",
		"report:export",
	],
};

export function getRolePermissions(role: Role): readonly Permission[] {
	return rolePermissions[role];
}

export function hasPermission(role: Role, permission: Permission): boolean {
	return rolePermissions[role].includes(permission);
}

export function requirePermission(role: Role, permission: Permission): void {
	if (!hasPermission(role, permission)) {
		throw new PermissionDeniedError(role, permission);
	}
}

export function roleAllowsAny(role: Role, permissions: readonly Permission[]): boolean {
	return permissions.some((permission) => hasPermission(role, permission));
}
