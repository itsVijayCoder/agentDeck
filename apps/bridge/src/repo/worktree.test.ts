import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildWorktreePath, createWorktree, removeWorktree } from "./worktree.js";
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
				return "";
			},
		});

		const descriptor = await createWorktree("/repo/project", "run-1", "agentdeck/run-1", { baseDir, gitFactory });
		await removeWorktree("/repo/project", descriptor.path, { gitFactory });

		expect(calls).toEqual([
			["worktree", "add", join(baseDir, "run_run-1"), "-b", "agentdeck/run-1"],
			["worktree", "remove", join(baseDir, "run_run-1"), "--force"],
		]);
	});
});
