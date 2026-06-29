import { mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { defaultGitClientFactory, type GitClientFactory } from "./git.js";

export type WorktreeOptions = {
	baseDir?: string;
	gitFactory?: GitClientFactory;
};

export type WorktreeDescriptor = {
	branchName: string;
	path: string;
	repoPath: string;
	runId: string;
};

export async function createWorktree(
	repoPath: string,
	runId: string,
	branchName: string,
	options: WorktreeOptions = {},
): Promise<WorktreeDescriptor> {
	const normalizedRepoPath = resolve(repoPath);
	const worktreePath = buildWorktreePath(normalizedRepoPath, runId, options.baseDir);
	const git = (options.gitFactory ?? defaultGitClientFactory)(normalizedRepoPath);

	await mkdir(resolve(worktreePath, ".."), { recursive: true });
	await git.raw(["worktree", "add", worktreePath, "-b", branchName]);

	return {
		branchName,
		path: worktreePath,
		repoPath: normalizedRepoPath,
		runId,
	};
}

export async function removeWorktree(repoPath: string, worktreePath: string, options: WorktreeOptions = {}): Promise<void> {
	const git = (options.gitFactory ?? defaultGitClientFactory)(resolve(repoPath));
	await git.raw(["worktree", "remove", resolve(worktreePath), "--force"]);
}

export function buildWorktreePath(repoPath: string, runId: string, baseDir?: string): string {
	const normalizedRepoPath = resolve(repoPath);
	const worktreeBase = baseDir ? resolve(baseDir) : resolve(normalizedRepoPath, "..", "agentdeck-worktrees", basename(normalizedRepoPath));
	return join(worktreeBase, `run_${sanitizePathSegment(runId)}`);
}

function sanitizePathSegment(value: string): string {
	return value.replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 96);
}
