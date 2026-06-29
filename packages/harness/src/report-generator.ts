import type {
	CandidateResult,
	DecisionReportDetail,
	FileChangeSummary,
	JudgeScore,
	RoutingDecision,
	SynthesisResult,
	TaskClassification,
} from "@agentdeck/core";

export type GenerateDecisionReportInput = {
	classification: TaskClassification;
	generatedAt?: string;
	id: string;
	routing: RoutingDecision;
	scores: readonly JudgeScore[];
	sessionId: string;
	synthesis: SynthesisResult;
	task: string;
	workspaceId: string;
	candidates: readonly CandidateResult[];
	filesChanged?: readonly FileChangeSummary[];
	humanInterventions?: DecisionReportDetail["humanInterventions"];
};

export function generateDecisionReportDetail(input: GenerateDecisionReportInput): DecisionReportDetail {
	const verification = input.candidates.flatMap((candidate) => candidate.verifierResults ?? []);
	const risks = input.candidates.flatMap((candidate) => candidate.riskFindings ?? []);
	const generatedAt = input.generatedAt ?? new Date().toISOString();
	const commandsRun = verification.length;
	const latencyMs = input.candidates.reduce((max, candidate) => Math.max(max, candidate.latencyMs), 0);
	const costUsd = input.candidates.reduce((sum, candidate) => sum + (candidate.costUsd ?? 0), 0);
	const filesChanged = input.filesChanged ?? summarizeFilesChanged(input.candidates);

	return {
		agentsUsed: [...new Set(input.candidates.map((candidate) => candidate.agentKind))],
		candidateResults: [...input.candidates],
		candidateScores: [...input.scores],
		classification: input.classification,
		commandsRun,
		confidence: input.synthesis.confidence ?? input.scores[0]?.totalScore ?? 0,
		costUsd: roundMoney(costUsd),
		filesChanged: [...filesChanged],
		generatedAt,
		humanInterventions: [...(input.humanInterventions ?? [])],
		id: input.id,
		latencyMs,
		recommendation: input.synthesis.recommendation,
		risks,
		routing: input.routing,
		runIds: input.candidates.map((candidate) => candidate.runId).filter(Boolean),
		sessionId: input.sessionId,
		summary: input.synthesis.reason,
		synthesis: input.synthesis,
		task: input.task,
		verification,
		workspaceId: input.workspaceId,
		...(input.synthesis.winningCandidateId ? { winningCandidateId: input.synthesis.winningCandidateId } : {}),
	};
}

function summarizeFilesChanged(candidates: readonly CandidateResult[]): FileChangeSummary[] {
	return candidates
		.filter((candidate) => candidate.diff && candidate.status === "completed")
		.map((candidate) => ({
			additions: candidate.diff?.additions ?? 0,
			deletions: candidate.diff?.deletions ?? 0,
			path: `${candidate.label} patch`,
		}));
}

function roundMoney(value: number): number {
	return Number(value.toFixed(4));
}
