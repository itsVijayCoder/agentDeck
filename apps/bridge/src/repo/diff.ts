import { resolve } from "node:path";

import { defaultGitClientFactory, type GitClientFactory } from "./git.js";

export async function generateDiff(worktreePath: string, gitFactory: GitClientFactory = defaultGitClientFactory): Promise<string> {
	return gitFactory(resolve(worktreePath)).diff();
}
