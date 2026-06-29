import type { CandidateResult, JudgeScore, SynthesisResult } from "@agentdeck/core";

export function synthesizeCandidates(
	candidates: readonly CandidateResult[],
	scores: readonly JudgeScore[],
): SynthesisResult {
	if (scores.length === 0 || candidates.length === 0) {
		return {
			reason: "No candidates produced comparable output.",
			recommendation: "rerun",
			strategy: "rerun",
		};
	}

	const best = scores[0];
	const winner = candidates.find((candidate) => candidate.candidateId === best.candidateId);
	if (!winner || best.recommendation === "reject") {
		return {
			reason: "All candidates scored below the acceptance threshold.",
			recommendation: "rerun",
			strategy: "rerun",
		};
	}

	const runnerUp = scores[1];
	const closeScore = runnerUp ? best.totalScore - runnerUp.totalScore < 0.06 : false;
	const recommendation = closeScore && best.recommendation === "accept" ? "review-carefully" : best.recommendation;

	return {
		confidence: best.totalScore,
		reason: closeScore
			? `${winner.label} leads by a narrow margin; human review should compare the top candidates.`
			: `${winner.label} produced the strongest verified candidate.`,
		recommendation,
		strategy: "select-best",
		winningCandidateId: winner.candidateId,
		winningRunId: winner.runId,
		...(winner.diff ? { finalDiff: winner.diff } : {}),
	};
}
