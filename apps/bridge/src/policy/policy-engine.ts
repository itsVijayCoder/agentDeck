import type { PrivacyMode } from "@agentdeck/core";
import {
	classifyCommandRisk,
	getPrivacyStorageDecision,
	type PolicyDecision,
	type PrivacyStorageDecision,
} from "@agentdeck/policy";

export type PolicyGateResult = {
	allowed: boolean;
	blocked: boolean;
	command: string;
	decision: PolicyDecision;
	privacyDecision: PrivacyStorageDecision;
	requiresApproval: boolean;
};

export class PolicyEngine {
	constructor(private readonly privacyMode: PrivacyMode = "metadata-only") {}

	evaluateCommand(command: string): PolicyGateResult {
		const decision = classifyCommandRisk(command);
		const privacyDecision = getPrivacyStorageDecision(this.privacyMode);

		return {
			allowed: decision.decision === "allow",
			blocked: decision.decision === "deny",
			command,
			decision,
			privacyDecision,
			requiresApproval: decision.decision === "approval",
		};
	}

	shouldSyncToCloud(privacyMode = this.privacyMode): boolean {
		return getPrivacyStorageDecision(privacyMode).r2 !== "blocked";
	}

	shouldRedactBeforeSync(privacyMode = this.privacyMode): boolean {
		const decision = getPrivacyStorageDecision(privacyMode);
		return decision.r2 === "redacted" || decision.providerCalls !== "policy-controlled";
	}
}
