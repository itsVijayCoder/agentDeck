import { describe, expect, it } from "vitest";

import { AdapterRegistry } from "./registry.js";
import type { HarnessAdapter, HarnessSessionContext, HarnessSessionHandle, ProbeResult } from "./types.js";

const session: HarnessSessionHandle = {
	agentKind: "codex",
	runId: "run_1",
	approve: async () => {},
	cancel: async () => {},
	dispose: async () => {},
	pause: async () => {},
	resume: async () => {},
	sendTerminalInput: async () => {},
	sendUserMessage: async () => {},
	start: async () => {},
};

function adapter(id: string, kind: HarnessAdapter["kind"]): HarnessAdapter {
	return {
		displayName: id,
		id,
		kind,
		createSession: async (_ctx: HarnessSessionContext) => {
			void _ctx;
			return session;
		},
		probe: async (): Promise<ProbeResult> => ({
			agentKind: kind,
			authStatus: "unknown",
			capabilities: [],
			found: false,
			warnings: [],
		}),
	};
}

describe("AdapterRegistry", () => {
	it("registers and lists adapters by agent kind", () => {
		const registry = new AdapterRegistry();
		const codex = adapter("codex", "codex");
		const pi = adapter("pi", "pi");

		registry.register(codex);
		registry.register(pi);

		expect(registry.get("codex")).toBe(codex);
		expect(registry.require("pi")).toBe(pi);
		expect(registry.list()).toEqual([codex, pi]);
	});

	it("allows idempotent replacement by the same adapter id", () => {
		const registry = new AdapterRegistry();
		const first = adapter("codex", "codex");
		const second = adapter("codex", "codex");

		registry.register(first);
		registry.register(second);

		expect(registry.require("codex")).toBe(second);
	});

	it("rejects conflicting adapters for the same kind", () => {
		const registry = new AdapterRegistry();

		registry.register(adapter("codex-primary", "codex"));

		expect(() => registry.register(adapter("codex-secondary", "codex"))).toThrow(
			"Adapter kind codex is already registered by codex-primary.",
		);
	});

	it("throws for missing required adapters", () => {
		const registry = new AdapterRegistry();

		expect(() => registry.require("aider")).toThrow("No adapter registered for aider.");
	});
});
