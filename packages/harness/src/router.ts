import type {
	AgentCandidate,
	AgentKind,
	PrivacyMode,
	RoutingDecision,
	RoutingStrategy,
	TaskClassification,
} from "@agentdeck/core";

export type RouteTaskOptions = {
	maxCandidates?: number;
	model?: string;
	provider?: string;
	requestedStrategy?: RoutingStrategy;
};

const localFirstAgents = new Set<AgentKind>(["opencode", "pi"]);
const frontierOrder: readonly AgentKind[] = ["claude-code", "codex", "pi", "opencode", "qwen-code", "aider", "acp"];

export function routeTask(
	classification: TaskClassification,
	availableAgents: readonly AgentKind[],
	privacyMode: PrivacyMode,
	options: RouteTaskOptions = {},
): RoutingDecision {
	const uniqueAgents = uniqueAgentKinds(availableAgents);
	const eligibleAgents = privacyMode === "local-only" ? uniqueAgents.filter((agent) => localFirstAgents.has(agent)) : uniqueAgents;
	const requestedStrategy = options.requestedStrategy ?? classification.suggestedStrategy;
	const strategy = normalizeStrategy(requestedStrategy, eligibleAgents.length);
	const maxCandidates = Math.max(1, options.maxCandidates ?? defaultCandidateCount(strategy));
	const orderedAgents = orderAgentsForStrategy(strategy, eligibleAgents);
	const selectedAgents = orderedAgents.slice(0, Math.min(maxCandidates, orderedAgents.length));
	const candidates = selectedAgents.map((agentKind, index) =>
		createCandidate(agentKind, index, {
			model: options.model,
			provider: options.provider,
		}),
	);

	return {
		budgetUsd: budgetForStrategy(strategy),
		candidates,
		latencyBudgetMs: latencyForStrategy(strategy),
		privacyMode,
		reason: reasonForStrategy(strategy, classification, candidates.length, privacyMode),
		strategy,
	};
}

function normalizeStrategy(strategy: RoutingStrategy, eligibleCount: number): RoutingStrategy {
	if (eligibleCount <= 1 && strategy !== "local-only") {
		return "single";
	}

	return strategy;
}

function defaultCandidateCount(strategy: RoutingStrategy): number {
	switch (strategy) {
		case "parallel-candidates":
			return 3;
		case "frontier-fallback":
			return 2;
		case "cascade":
			return 3;
		case "local-only":
		case "single":
			return 1;
	}
}

function orderAgentsForStrategy(strategy: RoutingStrategy, agents: readonly AgentKind[]): AgentKind[] {
	if (strategy === "frontier-fallback") {
		return frontierOrder.filter((agent) => agents.includes(agent));
	}

	if (strategy === "local-only") {
		return agents.filter((agent) => localFirstAgents.has(agent));
	}

	return [...agents];
}

function createCandidate(
	agentKind: AgentKind,
	index: number,
	options: { model?: string; provider?: string },
): AgentCandidate {
	const suffix = String.fromCharCode(97 + index);
	return {
		agentKind,
		id: `candidate-${suffix}`,
		label: `Candidate ${suffix.toUpperCase()}`,
		worktreeBranch: `agentdeck/candidate-${suffix}`,
		...(options.model ? { model: options.model } : {}),
		...(options.provider ? { provider: options.provider } : {}),
	};
}

function budgetForStrategy(strategy: RoutingStrategy): number {
	switch (strategy) {
		case "frontier-fallback":
			return 5;
		case "parallel-candidates":
			return 2;
		case "cascade":
			return 1.5;
		case "local-only":
		case "single":
			return 0.5;
	}
}

function latencyForStrategy(strategy: RoutingStrategy): number {
	switch (strategy) {
		case "frontier-fallback":
			return 30 * 60 * 1000;
		case "parallel-candidates":
			return 15 * 60 * 1000;
		case "cascade":
			return 10 * 60 * 1000;
		case "local-only":
		case "single":
			return 5 * 60 * 1000;
	}
}

function reasonForStrategy(
	strategy: RoutingStrategy,
	classification: TaskClassification,
	candidateCount: number,
	privacyMode: PrivacyMode,
): string {
	if (candidateCount === 0) {
		return `No eligible ${privacyMode} agents are available for ${classification.complexity} ${classification.category} work.`;
	}

	switch (strategy) {
		case "frontier-fallback":
			return `Critical ${classification.category} task routed to ${candidateCount} fallback candidates.`;
		case "parallel-candidates":
			return `Hard ${classification.category} task routed to ${candidateCount} isolated candidates.`;
		case "cascade":
			return `${classification.category} task routed as an ordered cascade.`;
		case "local-only":
			return `Privacy mode requires a local-only candidate.`;
		case "single":
			return `${classification.complexity} ${classification.category} task routed to one candidate.`;
	}
}

function uniqueAgentKinds(agents: readonly AgentKind[]): AgentKind[] {
	const seen = new Set<AgentKind>();
	const unique: AgentKind[] = [];
	for (const agent of agents) {
		if (seen.has(agent)) {
			continue;
		}
		seen.add(agent);
		unique.push(agent);
	}
	return unique;
}
