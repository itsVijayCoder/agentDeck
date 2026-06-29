import type { RoutingStrategy, TaskCategory, TaskClassification, TaskComplexity } from "@agentdeck/core";

type ClassificationRule = {
	category: TaskCategory;
	complexity: TaskComplexity;
	pattern: RegExp;
	reason: string;
	signal: string;
	strategy: RoutingStrategy;
};

const classificationRules: readonly ClassificationRule[] = [
	{
		category: "security",
		complexity: "critical",
		pattern: /\b(security|credential|secret|auth bypass|vulnerability|exploit|production)\b/iu,
		reason: "Security or production-sensitive work requires candidates, verification, and human review.",
		signal: "security-sensitive",
		strategy: "frontier-fallback",
	},
	{
		category: "migration",
		complexity: "critical",
		pattern: /\b(migrat(e|ion)|database|schema|deploy|release|publish)\b/iu,
		reason: "Migration or deployment-adjacent work has high blast radius.",
		signal: "high-blast-radius",
		strategy: "frontier-fallback",
	},
	{
		category: "refactor",
		complexity: "hard",
		pattern: /\b(refactor|architect|rewrite|redesign|overhaul|multi-agent|orchestrat(e|ion))\b/iu,
		reason: "Architectural or broad refactor work benefits from multiple implementation candidates.",
		signal: "broad-change",
		strategy: "parallel-candidates",
	},
	{
		category: "dependency-update",
		complexity: "hard",
		pattern: /\b(upgrade|update|dependency|dependencies|lockfile|package manager)\b/iu,
		reason: "Dependency changes need verification and often benefit from fallback candidates.",
		signal: "dependency-change",
		strategy: "cascade",
	},
	{
		category: "bugfix",
		complexity: "medium",
		pattern: /\b(fix|bug|error|fail|flaky|broken|regression|issue)\b/iu,
		reason: "Bugfix work should run through one agent and deterministic verification first.",
		signal: "bugfix",
		strategy: "single",
	},
	{
		category: "test-generation",
		complexity: "simple",
		pattern: /\b(test|spec|coverage|fixture)\b/iu,
		reason: "Test-focused work is usually narrow enough for one fast candidate.",
		signal: "test-focused",
		strategy: "single",
	},
	{
		category: "docs",
		complexity: "simple",
		pattern: /\b(doc|docs|readme|comment|copy|wording)\b/iu,
		reason: "Documentation work is usually safe to route to one candidate.",
		signal: "docs-focused",
		strategy: "single",
	},
];

export function classifyTask(task: string): TaskClassification {
	const normalizedTask = task.trim();
	const signals: string[] = [];

	for (const rule of classificationRules) {
		if (!rule.pattern.test(normalizedTask)) {
			continue;
		}

		signals.push(rule.signal);
		return {
			category: rule.category,
			complexity: rule.complexity,
			reason: rule.reason,
			signals,
			suggestedStrategy: rule.strategy,
		};
	}

	return {
		category: "feature",
		complexity: "medium",
		reason: "Default routing for product work is one agent plus verifier evidence.",
		signals: ["default-feature"],
		suggestedStrategy: "single",
	};
}
