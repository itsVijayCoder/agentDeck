import { redactWithCount } from "../redaction/secrets.js";
import { defaultGitClientFactory, type GitClientFactory } from "./git.js";
import { generateWorktreeDiff } from "./worktree.js";

export type PatchArtifact = {
	additions: number;
	baseCommit: string;
	deletions: number;
	diff: string;
	filesChanged: number;
	id: string;
	redactionCount: number;
	riskScore: number;
	runId: string;
};

export type PatchGeneratorOptions = {
	gitFactory?: GitClientFactory;
};

export class PatchGenerator {
	constructor(private readonly options: PatchGeneratorOptions = {}) {}

	async generate(input: { baseCommit: string; runId: string; worktreePath: string }): Promise<PatchArtifact> {
		const summary = await generateWorktreeDiff(input.worktreePath, this.options.gitFactory ?? defaultGitClientFactory);
		const redacted = redactWithCount(summary.diff);

		return {
			additions: summary.additions,
			baseCommit: input.baseCommit,
			deletions: summary.deletions,
			diff: redacted.value,
			filesChanged: summary.filesChanged,
			id: crypto.randomUUID(),
			redactionCount: redacted.redactionCount,
			riskScore: calculatePatchRiskScore(summary.filesChanged, summary.additions, summary.deletions),
			runId: input.runId,
		};
	}
}

export function calculatePatchRiskScore(filesChanged: number, additions: number, deletions: number): number {
	const changeVolume = additions + deletions;
	if (changeVolume > 500 || filesChanged > 20) {
		return 4;
	}
	if (changeVolume > 200 || filesChanged > 10) {
		return 3;
	}
	if (changeVolume > 50 || filesChanged > 3) {
		return 2;
	}
	return 1;
}
