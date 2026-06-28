import { createAgentDeckRepositories, type QueryableD1 } from "./repositories";

export const defaultWorkspaceSeed = {
	defaultBranch: "main",
	id: "ws_default",
	name: "Default Workspace",
	privacyMode: "metadata-only",
	repositoryUrl: null,
} as const;

export async function seedWorkspace(db: QueryableD1, workspaceId = defaultWorkspaceSeed.id): Promise<void> {
	const repositories = createAgentDeckRepositories(db);
	const existingWorkspace = await repositories.workspaces.findById(workspaceId);

	if (!existingWorkspace) {
		await repositories.workspaces.create({
			defaultBranch: defaultWorkspaceSeed.defaultBranch,
			id: workspaceId,
			name: defaultWorkspaceSeed.name,
			privacyMode: defaultWorkspaceSeed.privacyMode,
			repositoryUrl: defaultWorkspaceSeed.repositoryUrl,
		});
	}

	await repositories.machines.upsert({
		arch: "unknown",
		bridgeVersion: "0.0.0",
		displayName: "Unpaired local bridge",
		id: `${workspaceId}_machine_local`,
		os: "unknown",
		status: "offline",
		workspaceId,
	});

	await repositories.policyRules.upsert({
		action: "push, merge, publish, or deploy",
		defaultDecision: "deny",
		enabled: true,
		id: `${workspaceId}_policy_no_autopublish`,
		matcher: { commandIncludesAny: ["git push", "git merge", "npm publish", "pnpm deploy"] },
		reason: "AgentDeck requires explicit human approval before publishing or changing remote state.",
		risk: "critical",
		workspaceId,
	});

	await repositories.policyRules.upsert({
		action: "install or mutate dependencies",
		defaultDecision: "approval",
		enabled: true,
		id: `${workspaceId}_policy_dependency_changes`,
		matcher: { commandIncludesAny: ["pnpm add", "npm install", "yarn add", "bun add"] },
		reason: "Dependency changes can alter supply-chain risk and require a human gate.",
		risk: "medium",
		workspaceId,
	});
}
