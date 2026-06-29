import { describe, expect, it } from "vitest";

import { PolicyEngine } from "./policy-engine.js";

describe("PolicyEngine", () => {
	it("allows deterministic verification commands", () => {
		const result = new PolicyEngine().evaluateCommand("pnpm run test");

		expect(result.allowed).toBe(true);
		expect(result.requiresApproval).toBe(false);
		expect(result.blocked).toBe(false);
	});

	it("blocks critical commands instead of silently approving them", () => {
		const result = new PolicyEngine().evaluateCommand("git push origin main");

		expect(result.allowed).toBe(false);
		expect(result.blocked).toBe(true);
		expect(result.requiresApproval).toBe(false);
	});

	it("requires approval for environment-changing commands", () => {
		const result = new PolicyEngine().evaluateCommand("pnpm add lodash");

		expect(result.allowed).toBe(false);
		expect(result.blocked).toBe(false);
		expect(result.requiresApproval).toBe(true);
	});

	it("reports cloud sync and redaction decisions from privacy mode", () => {
		const localOnly = new PolicyEngine("local-only");
		const metadataOnly = new PolicyEngine("metadata-only");
		const fullSync = new PolicyEngine("full-sync");

		expect(localOnly.shouldSyncToCloud()).toBe(false);
		expect(metadataOnly.shouldSyncToCloud()).toBe(true);
		expect(metadataOnly.shouldRedactBeforeSync()).toBe(true);
		expect(fullSync.shouldRedactBeforeSync()).toBe(false);
	});
});
