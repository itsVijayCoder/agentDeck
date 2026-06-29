import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { detectAgents, pairingAgentsFromProbeResults } from "./detector.js";
import type { AgentCommandSpec } from "./types.js";

const specs: AgentCommandSpec[] = [
	{
		authPaths: ["/tmp/auth.json"],
		capabilities: ["terminal", "code-edit"],
		command: "codex",
		kind: "codex",
		versionArgs: ["--version"],
	},
	{
		authPaths: [],
		capabilities: ["terminal"],
		command: "missing-agent",
		kind: "aider",
		versionArgs: ["--version"],
	},
];

describe("detectAgents", () => {
	it("probes commands and auth status without reading secrets", async () => {
		const results = await detectAgents({
			authChecker: async () => "configured",
			specs,
			versionProbe: async (command) =>
				command === "codex" ? { found: true, stdout: "codex 1.0.0\nextra" } : { found: false },
		});

		expect(results).toEqual([
			expect.objectContaining({
				agentKind: "codex",
				authStatus: "configured",
				command: "codex",
				found: true,
				version: "codex 1.0.0",
			}),
			expect.objectContaining({
				agentKind: "aider",
				authStatus: "unknown",
				found: false,
			}),
		]);
	});

	it("converts only found agents into pairing payload entries", async () => {
		const results = await detectAgents({
			authChecker: async () => "missing",
			specs,
			versionProbe: async (command) => ({ found: command === "codex", stderr: "codex 1.0.0" }),
		});

		expect(pairingAgentsFromProbeResults(results)).toEqual([
			{
				authStatus: "missing",
				capabilities: ["terminal", "code-edit"],
				command: "codex",
				kind: "codex",
				version: "codex 1.0.0",
			},
		]);
	});

	it("can use the default PATH/version and auth-file probes", async () => {
		const dir = await mkdtemp(join(tmpdir(), "agentdeck-auth-"));
		const authPath = join(dir, "auth.json");
		await writeFile(authPath, "{}", "utf8");

		const results = await detectAgents({
			specs: [
				{
					authPaths: [authPath],
					capabilities: ["terminal"],
					command: process.execPath,
					kind: "codex",
					versionArgs: ["--version"],
				},
				{
					authPaths: [join(dir, "missing-auth.json")],
					capabilities: ["terminal"],
					command: process.execPath,
					kind: "aider",
					versionArgs: ["--version"],
				},
				{
					authPaths: [],
					capabilities: ["terminal"],
					command: process.execPath,
					kind: "pi",
					versionArgs: ["--version"],
				},
			],
		});

		expect(results[0]).toMatchObject({ authStatus: "configured", found: true });
		expect(results[1]).toMatchObject({ authStatus: "missing", found: true });
		expect(results[2]).toMatchObject({ authStatus: "unknown", found: true });
	});

	it("handles stderr versions and blank version output", async () => {
		const [stderrResult, blankResult] = await detectAgents({
			authChecker: async () => "configured",
			specs: [
				{ ...specs[0]!, command: "stderr-agent" },
				{ ...specs[0]!, command: "blank-agent", kind: "pi" },
			],
			versionProbe: async (command) =>
				command === "stderr-agent" ? { found: true, stderr: "stderr-version" } : { found: true, stdout: "   " },
		});

		expect(stderrResult).toMatchObject({ version: "stderr-version" });
		expect(blankResult?.version).toBeUndefined();
	});
});
