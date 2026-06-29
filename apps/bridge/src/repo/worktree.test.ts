import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildWorktreePath, createWorktree, generateWorktreeDiff, removeWorktree } from "./worktree.js";
import type { GitClientFactory } from "./git.js";

describe("worktree utilities", () => {
	it("builds stable sanitized worktree paths", () => {
		expect(buildWorktreePath("/repo/project", "run:one/two", "/tmp/base")).toBe("/tmp/base/run_run_one_two");
		expect(buildWorktreePath("/repo/project", "run-1")).toBe("/repo/agentdeck-worktrees/project/run_run-1");
	});

	it("creates and removes worktrees through the git boundary", async () => {
		const calls: string[][] = [];
		const baseDir = await mkdtemp(join(tmpdir(), "agentdeck-worktree-"));
		const gitFactory: GitClientFactory = () => ({
			diff: async () => "",
			raw: async (args) => {
				calls.push(args);
				if (args[0] === "rev-parse") {
					return "abc123\n";
				}
				return "";
			},
		});

		const descriptor = await createWorktree("/repo/project", "run-1", "agentdeck/run-1", {
			baseDir,
			gitFactory,
			targetRef: "main",
		});
		await removeWorktree("/repo/project", descriptor.path, { gitFactory });

		expect(calls).toEqual([
			["worktree", "add", join(baseDir, "run_run-1"), "-b", "agentdeck/run-1", "main"],
			["rev-parse", "HEAD"],
			["worktree", "remove", join(baseDir, "run_run-1"), "--force"],
		]);
		expect(descriptor.baseCommit).toBe("abc123");
	});

	it("summarizes worktree diffs", async () => {
		const calls: string[][] = [];
		const gitFactory: GitClientFactory = () => ({
			diff: async () => "",
			raw: async (args) => {
				calls.push(args);
				if (args[1] === "--binary") {
					return "diff --git a/file.ts b/file.ts\n";
				}
				if (args[1] === "--name-only") {
					return "file.ts\nREADME.md\n";
				}
				if (args[1] === "--numstat") {
					return "10\t2\tfile.ts\n-\t-\tbinary.png\n";
				}
				return "";
			},
		});

		await expect(generateWorktreeDiff("/repo/worktree", gitFactory)).resolves.toEqual({
			additions: 10,
			deletions: 2,
			diff: "diff --git a/file.ts b/file.ts\n",
			filesChanged: 2,
		});
		expect(calls).toEqual([
			["diff", "--binary", "HEAD"],
			["diff", "--name-only", "HEAD"],
			["diff", "--numstat", "HEAD"],
		]);
	});
});
