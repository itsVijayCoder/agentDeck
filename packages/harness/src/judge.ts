import type { CandidateResult, JudgeScore, JudgeScoreBreakdown, ReportRecommendation, RiskLevel } from "@agentdeck/core";

const weights: JudgeScoreBreakdown = {
	correctness: 0.2,
	costLatency: 0.1,
	humanPreference: 0.1,
	minimality: 0.15,
	safety: 0.1,
	verification: 0.35,
};

export function judgeCandidates(results: readonly CandidateResult[]): JudgeScore[] {
	return results
		.map((result) => {
			const breakdown = scoreCandidate(result);
			const totalScore = roundScore(
				weights.verification * breakdown.verification +
					weights.correctness * breakdown.correctness +
					weights.minimality * breakdown.minimality +
					weights.safety * breakdown.safety +
					weights.humanPreference * breakdown.humanPreference +
					weights.costLatency * breakdown.costLatency,
			);

			return {
				breakdown,
				candidateId: result.candidateId,
				recommendation: recommendationForScore(totalScore, result.status),
				runId: result.runId,
				totalScore,
			};
		})
		.sort((left, right) => right.totalScore - left.totalScore);
}

function scoreCandidate(result: CandidateResult): JudgeScoreBreakdown {
	if (result.status !== "completed") {
		return {
			correctness: 0,
			costLatency: 0,
			humanPreference: 0,
			minimality: 0,
			safety: 0,
			verification: 0,
		};
	}

	const verification = verificationScore(result);
	const minimality = minimalityScore(result);
	const safety = safetyScore(result);
	const costLatency = costLatencyScore(result);

	return {
		correctness: roundScore(Math.max(0.35, verification * 0.85)),
		costLatency,
		humanPreference: clampScore(result.policyFit ?? 0.7),
		minimality,
		safety,
		verification,
	};
}

function verificationScore(result: CandidateResult): number {
	const verifiers = result.verifierResults ?? [];
	if (verifiers.length === 0) {
		return 0.65;
	}

	const failed = verifiers.filter((verifier) => verifier.status === "failed").length;
	if (failed > 0) {
		return roundScore(Math.max(0.15, 1 - failed / verifiers.length));
	}

	const warnings = verifiers.filter((verifier) => verifier.status === "warning" || verifier.status === "pending").length;
	if (warnings > 0) {
		return roundScore(0.85 - Math.min(0.25, warnings * 0.08));
	}

	return 1;
}

function minimalityScore(result: CandidateResult): number {
	const diff = result.diff;
	if (!diff) {
		return 0.7;
	}

	const changedLines = diff.additions + diff.deletions;
	if (diff.filesChanged <= 2 && changedLines <= 80) {
		return 1;
	}
	if (diff.filesChanged <= 6 && changedLines <= 300) {
		return 0.75;
	}
	if (diff.filesChanged <= 12 && changedLines <= 800) {
		return 0.55;
	}
	return 0.35;
}

function safetyScore(result: CandidateResult): number {
	const risks = result.riskFindings ?? [];
	if (risks.length === 0) {
		return 0.9;
	}

	const worst = risks.reduce((score, risk) => Math.max(score, riskWeight(risk.severity)), 0);
	return roundScore(Math.max(0, 1 - worst));
}

function riskWeight(severity: RiskLevel): number {
	switch (severity) {
		case "critical":
			return 0.9;
		case "high":
			return 0.65;
		case "medium":
			return 0.35;
		case "low":
			return 0.15;
		default:
			return 0.3;
	}
}

function costLatencyScore(result: CandidateResult): number {
	const cost = result.costUsd ?? 0;
	const costScore = cost <= 0.1 ? 1 : cost <= 0.5 ? 0.8 : cost <= 2 ? 0.55 : 0.3;
	const latencyScore = result.latencyMs <= 60_000 ? 1 : result.latencyMs <= 5 * 60_000 ? 0.75 : result.latencyMs <= 15 * 60_000 ? 0.5 : 0.3;
	return roundScore((costScore + latencyScore) / 2);
}

function recommendationForScore(score: number, status: CandidateResult["status"]): ReportRecommendation {
	if (status !== "completed") {
		return "reject";
	}
	if (score >= 0.82) {
		return "accept";
	}
	if (score >= 0.5) {
		return "review-carefully";
	}
	return "reject";
}

function clampScore(value: number): number {
	return roundScore(Math.max(0, Math.min(1, value)));
}

function roundScore(value: number): number {
	return Number(value.toFixed(3));
}
