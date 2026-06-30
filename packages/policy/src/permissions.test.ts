import { describe, expect, it } from "vitest";

import { getRolePermissions, hasPermission, PermissionDeniedError, requirePermission, roleAllowsAny } from "./permissions";

describe("workspace role permissions", () => {
	it("gives owners full control, members execution control, and observers read/audit only", () => {
		expect(hasPermission("owner", "member:remove")).toBe(true);
		expect(hasPermission("owner", "policy:manage")).toBe(true);

		expect(hasPermission("member", "session:control")).toBe(true);
		expect(hasPermission("member", "terminal:jump-in")).toBe(true);
		expect(hasPermission("member", "member:invite")).toBe(false);
		expect(hasPermission("member", "audit:read")).toBe(false);

		expect(hasPermission("observer", "session:read")).toBe(true);
		expect(hasPermission("observer", "audit:read")).toBe(true);
		expect(hasPermission("observer", "approval:decide")).toBe(false);
		expect(hasPermission("observer", "terminal:jump-in")).toBe(false);
	});

	it("returns immutable permission views by convention", () => {
		expect(getRolePermissions("observer")).toEqual(["session:read", "audit:read"]);
	});

	it("throws a typed error when a role is missing a required permission", () => {
		expect(() => requirePermission("observer", "approval:decide")).toThrow(PermissionDeniedError);
		expect(() => requirePermission("owner", "approval:decide")).not.toThrow();
	});

	it("checks permission groups for route surfaces", () => {
		expect(roleAllowsAny("member", ["audit:read", "queue:manage"])).toBe(true);
		expect(roleAllowsAny("observer", ["terminal:jump-in", "approval:decide"])).toBe(false);
	});
});
