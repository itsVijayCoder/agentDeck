import type { PrivacyMode, RiskLevel } from "@agentdeck/core";

export type PolicyDecision = {
	decision: "allow" | "approval" | "deny";
	risk: RiskLevel;
	reason: string;
};

export type PrivacyStorageDecision = {
	d1: "metadata" | "blocked";
	r2: "blocked" | "redacted" | "full";
	liveStream: "local-relay" | "encrypted-cloud";
	providerCalls: "local-only" | "approval-required" | "policy-controlled";
};

const criticalCommandPatterns: RegExp[] = [
	/\brm\s+-rf\b/,
	/\bsudo\b/,
	/\bgit\s+push\b/,
	/\bgh\s+pr\s+merge\b/,
	/\bnpm\s+publish\b/,
	/\bpnpm\s+publish\b/,
	/\bterraform\s+apply\b/,
	/\bkubectl\s+(apply|delete)\b/,
	/\bdocker\s+(rm|system\s+prune|volume\s+rm)\b/,
	/\b(gcloud|aws|az)\b.*\b(credentials?|secrets?|login|configure)\b/,
];

const highRiskCommandPatterns: RegExp[] = [
	/\bcurl\b.+\|\s*(bash|sh)\b/,
	/\bwget\b.+\|\s*(bash|sh)\b/,
	/\bchmod\s+-r\b/,
	/\bchown\s+-r\b/,
	/\b(psql|mysql)\b.*\b(migrate|drop|delete|truncate)\b/,
	/\bcat\b.+\.env\b/,
	/\b(printenv|env)\b/,
	/\bdeploy\b/,
];

const mediumRiskCommandPatterns: RegExp[] = [
	/\b(npm|pnpm|yarn|bun)\s+(install|add|upgrade|update)\b/,
	/\bpip\s+install\b/,
	/\bbrew\s+install\b/,
	/\bdocker\s+(build|compose)\b/,
	/\bgit\s+checkout\b/,
	/\bgh\b/,
];

const lowRiskCommandPatterns: RegExp[] = [
	/\b(npm|pnpm|yarn|bun)\s+(test|run\s+test|run\s+typecheck|run\s+lint|run\s+build)\b/,
	/\bgit\s+(status|diff|log|show)\b/,
	/\brg\b/,
	/\bls\b/,
];

export function classifyCommandRisk(command: string): PolicyDecision {
	const normalized = command.trim().toLowerCase();

	if (!normalized) {
		return {
			decision: "deny",
			risk: "low",
			reason: "Empty commands are ignored.",
		};
	}

	if (matchesAny(normalized, criticalCommandPatterns)) {
		return {
			decision: "deny",
			risk: "critical",
			reason: "Critical command is blocked by default and requires explicit policy override.",
		};
	}

	if (matchesAny(normalized, highRiskCommandPatterns)) {
		return {
			decision: "approval",
			risk: "high",
			reason: "Command can modify infrastructure, expose secrets, or execute untrusted network scripts.",
		};
	}

	if (matchesAny(normalized, mediumRiskCommandPatterns)) {
		return {
			decision: "approval",
			risk: "medium",
			reason: "Command can change dependencies, local environment, or external service state.",
		};
	}

	if (matchesAny(normalized, lowRiskCommandPatterns)) {
		return {
			decision: "allow",
			risk: "low",
			reason: "Command is read-only or deterministic verification.",
		};
	}

	return {
		decision: "approval",
		risk: "medium",
		reason: "Unknown command requires review until a workspace policy classifies it.",
	};
}

export function getPrivacyStorageDecision(mode: PrivacyMode): PrivacyStorageDecision {
	switch (mode) {
		case "local-only":
			return {
				d1: "metadata",
				r2: "blocked",
				liveStream: "local-relay",
				providerCalls: "local-only",
			};
		case "metadata-only":
			return {
				d1: "metadata",
				r2: "redacted",
				liveStream: "encrypted-cloud",
				providerCalls: "approval-required",
			};
		case "full-sync":
			return {
				d1: "metadata",
				r2: "full",
				liveStream: "encrypted-cloud",
				providerCalls: "policy-controlled",
			};
	}
}

export function requiresHumanApproval(decision: PolicyDecision): boolean {
	return decision.decision === "approval" || decision.decision === "deny";
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
	return patterns.some((pattern) => pattern.test(value));
}
