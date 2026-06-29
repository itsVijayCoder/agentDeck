import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { probeCommand } from "./probe.js";

describe("probeCommand", () => {
	it("normalizes found command probes", async () => {
		const result = await probeCommand(
			{
				authPaths: ["/auth.json"],
				capabilities: ["terminal", "code-edit"],
				command: "codex",
				kind: "codex",
				versionArgs: ["--version"],
			},
			{
				authChecker: async () => "configured",
				versionProbe: async () => ({ found: true, stdout: "codex 1.2.3\nextra" }),
			},
		);

		expect(result).toEqual({
			agentKind: "codex",
			authStatus: "configured",
			capabilities: ["terminal", "code-edit"],
			command: "codex",
			found: true,
			installSource: "path",
			version: "codex 1.2.3",
			warnings: [],
		});
	});

	it("returns an actionable missing-command result", async () => {
		const result = await probeCommand(
			{
				authPaths: [],
				capabilities: ["terminal"],
				command: "missing-agent",
				kind: "aider",
				suggestedFix: "Install Aider.",
				versionArgs: ["--version"],
			},
			{
				versionProbe: async () => ({ found: false }),
			},
		);

		expect(result).toMatchObject({
			agentKind: "aider",
			authStatus: "unknown",
			capabilities: [],
			found: false,
			suggestedFix: "Install Aider.",
			warnings: ["missing-agent was not found on PATH."],
		});
	});

	it("can use the default version and auth-file probes", async () => {
		const dir = await mkdtemp(join(tmpdir(), "agentdeck-probe-"));
		const authPath = join(dir, "auth.json");
		await writeFile(authPath, "{}", "utf8");

		const configured = await probeCommand({
			authPaths: [authPath],
			capabilities: ["terminal"],
			command: process.execPath,
			kind: "pi",
			versionArgs: ["--version"],
		});
		const missingAuth = await probeCommand({
			authPaths: [join(dir, "missing.json")],
			capabilities: ["terminal"],
			command: process.execPath,
			kind: "aider",
			versionArgs: ["--version"],
		});

		expect(configured).toMatchObject({ authStatus: "configured", found: true });
		expect(missingAuth).toMatchObject({ authStatus: "missing", found: true });
	});
});
