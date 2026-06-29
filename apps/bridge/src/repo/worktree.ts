import { mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { defaultGitClientFactory, type GitClientFactory } from "./git.js";

export type WorktreeOptions = {
	baseDir?: string;
	gitFactory?: GitClientFactory;
	targetRef?: string;
};

export type WorktreeDescriptor = {
	baseCommit: string;
	branchName: string;
	path: string;
	repoPath: string;
	runId: string;
};

export type WorktreeDiffSummary = {
	additions: number;
	deletions: number;
	diff: string;
	filesChanged: number;
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
	const addArgs = ["worktree", "add", worktreePath, "-b", branchName];
	if (options.targetRef) {
		addArgs.push(options.targetRef);
	}

	await mkdir(resolve(worktreePath, ".."), { recursive: true });
	await git.raw(addArgs);
	const baseCommit = (await (options.gitFactory ?? defaultGitClientFactory)(worktreePath).raw(["rev-parse", "HEAD"])).trim();

	return {
		baseCommit,
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

export async function generateWorktreeDiff(
	worktreePath: string,
	gitFactory: GitClientFactory = defaultGitClientFactory,
): Promise<WorktreeDiffSummary> {
	const git = gitFactory(resolve(worktreePath));
	const [diff, nameOnly, numstat] = await Promise.all([
		git.raw(["diff", "--binary", "HEAD"]),
		git.raw(["diff", "--name-only", "HEAD"]),
		git.raw(["diff", "--numstat", "HEAD"]),
	]);
	const stats = parseNumstat(numstat);

	return {
		...stats,
		diff,
		filesChanged: nameOnly
			.split(/\r?\n/u)
			.map((line) => line.trim())
			.filter(Boolean).length,
	};
}

export function buildWorktreePath(repoPath: string, runId: string, baseDir?: string): string {
	const normalizedRepoPath = resolve(repoPath);
	const worktreeBase = baseDir ? resolve(baseDir) : resolve(normalizedRepoPath, "..", "agentdeck-worktrees", basename(normalizedRepoPath));
	return join(worktreeBase, `run_${sanitizePathSegment(runId)}`);
}

function sanitizePathSegment(value: string): string {
	return value.replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 96);
}

function parseNumstat(value: string): Pick<WorktreeDiffSummary, "additions" | "deletions"> {
	let additions = 0;
	let deletions = 0;

	for (const line of value.split(/\r?\n/u)) {
		const [rawAdditions, rawDeletions] = line.split(/\s+/u);
		const parsedAdditions = Number(rawAdditions);
		const parsedDeletions = Number(rawDeletions);
		if (Number.isFinite(parsedAdditions)) {
			additions += parsedAdditions;
		}
		if (Number.isFinite(parsedDeletions)) {
			deletions += parsedDeletions;
		}
	}

	return { additions, deletions };
}
