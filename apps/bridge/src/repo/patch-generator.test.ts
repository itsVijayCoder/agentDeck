import { describe, expect, it } from "vitest";

import { calculatePatchRiskScore, PatchGenerator } from "./patch-generator.js";
import type { GitClientFactory } from "./git.js";

describe("PatchGenerator", () => {
	it("generates redacted patch artifacts with risk metadata", async () => {
		const gitFactory: GitClientFactory = () => ({
			diff: async () => "",
			raw: async (args) => {
				if (args[1] === "--binary") {
					return "diff --git a/.env b/.env\n+OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz\n";
				}
				if (args[1] === "--name-only") {
					return ".env\nsrc/app.ts\n";
				}
				if (args[1] === "--numstat") {
					return "60\t1\t.env\n1\t0\tsrc/app.ts\n";
				}
				return "";
			},
		});

		const artifact = await new PatchGenerator({ gitFactory }).generate({
			baseCommit: "abc123",
			runId: "run-1",
			worktreePath: "/repo/worktree",
		});

		expect(artifact).toMatchObject({
			additions: 61,
			baseCommit: "abc123",
			deletions: 1,
			filesChanged: 2,
			redactionCount: 1,
			riskScore: 2,
			runId: "run-1",
		});
		expect(artifact.diff).toContain("OPENAI_API_KEY=[REDACTED]");
	});

	it("scores patches by change volume and file count", () => {
		expect(calculatePatchRiskScore(1, 10, 5)).toBe(1);
		expect(calculatePatchRiskScore(4, 10, 5)).toBe(2);
		expect(calculatePatchRiskScore(2, 201, 0)).toBe(3);
		expect(calculatePatchRiskScore(21, 1, 1)).toBe(4);
	});
});
