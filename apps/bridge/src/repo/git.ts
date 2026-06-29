import simpleGit from "simple-git";

export type GitClient = {
	diff(args?: string[]): Promise<string>;
	raw(args: string[]): Promise<string>;
};

export type GitClientFactory = (cwd: string) => GitClient;

export const defaultGitClientFactory: GitClientFactory = (cwd) => simpleGit(cwd);
