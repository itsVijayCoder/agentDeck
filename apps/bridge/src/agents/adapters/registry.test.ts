import { describe, expect, it } from "vitest";
import { AdapterRegistry, type HarnessAdapter } from "@agentdeck/harness";

import type { PtyManager } from "../../pty/pty-manager.js";
import { createBridgeAdapterRegistry, probeBridgeAdapters } from "./registry.js";

describe("bridge adapter registry", () => {
	it("registers all Phase 06 adapters", () => {
		const registry = createBridgeAdapterRegistry({ ptyManager: { spawn: () => undefined } as unknown as PtyManager });

		expect(registry.list().map((adapter) => adapter.kind)).toEqual([
			"claude-code",
			"codex",
			"opencode",
			"qwen-code",
			"pi",
			"aider",
			"acp",
		]);
	});

	it("probes registered adapters through the interface", async () => {
		const registry = new AdapterRegistry();
		const adapter: HarnessAdapter = {
			displayName: "Fake",
			id: "codex",
			kind: "codex",
			createSession: async () => {
				throw new Error("not needed");
			},
			probe: async () => ({
				agentKind: "codex",
				authStatus: "configured",
				capabilities: ["terminal"],
				command: "codex",
				found: true,
				warnings: [],
			}),
		};
		registry.register(adapter);

		await expect(probeBridgeAdapters(registry)).resolves.toEqual([
			expect.objectContaining({ agentKind: "codex", found: true }),
		]);
	});
});
