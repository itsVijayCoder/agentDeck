import type { AgentKind, PrivacyMode, RiskLevel, RunStatus, VerificationStatus } from "./agentdeck";

export type TaskComplexity = "simple" | "medium" | "hard" | "critical";

export type TaskCategory =
	| "bugfix"
	| "dependency-update"
	| "docs"
	| "feature"
	| "migration"
	| "refactor"
	| "security"
	| "test-generation";

export type RoutingStrategy = "cascade" | "frontier-fallback" | "local-only" | "parallel-candidates" | "single";

export type ReportRecommendation = "accept" | "review-carefully" | "reject" | "rerun";

export type TaskClassification = {
	category: TaskCategory;
	complexity: TaskComplexity;
	reason: string;
	signals: string[];
	suggestedStrategy: RoutingStrategy;
};

export type AgentCandidate = {
	agentKind: AgentKind;
	id: string;
	label: string;
	worktreeBranch: string;
	model?: string;
	provider?: string;
};

export type RoutingDecision = {
	budgetUsd: number;
	candidates: AgentCandidate[];
	latencyBudgetMs: number;
	privacyMode: PrivacyMode;
	reason: string;
	strategy: RoutingStrategy;
};

export type CandidateRunStatus = Extract<RunStatus, "cancelled" | "completed" | "failed"> | "timeout";

export type CandidateVerificationSummary = {
	command: string;
	id: string;
	status: VerificationStatus;
	durationMs?: number;
	summary?: string;
};

export type CandidateDiffSummary = {
	additions: number;
	deletions: number;
	filesChanged: number;
	artifactId?: string;
	objectKey?: string;
};

export type RiskFinding = {
	description: string;
	severity: RiskLevel;
};

export type FileChangeSummary = {
	additions: number;
	deletions: number;
	path: string;
};

export type HumanIntervention = {
	description: string;
	timestamp: string;
	type: string;
};

export type CandidateResult = {
	agentKind: AgentKind;
	candidateId: string;
	label: string;
	latencyMs: number;
	runId: string;
	status: CandidateRunStatus;
	costUsd?: number;
	diff?: CandidateDiffSummary;
	policyFit?: number;
	riskFindings?: RiskFinding[];
	verifierResults?: CandidateVerificationSummary[];
};

export type JudgeScoreBreakdown = {
	correctness: number;
	costLatency: number;
	humanPreference: number;
	minimality: number;
	safety: number;
	verification: number;
};

export type JudgeScore = {
	breakdown: JudgeScoreBreakdown;
	candidateId: string;
	recommendation: ReportRecommendation;
	runId: string;
	totalScore: number;
};

export type SynthesisStrategy = "merge" | "rerun" | "select-best";

export type SynthesisResult = {
	reason: string;
	recommendation: ReportRecommendation;
	strategy: SynthesisStrategy;
	confidence?: number;
	finalDiff?: CandidateDiffSummary;
	winningCandidateId?: string;
	winningRunId?: string;
};

export type DecisionReportDetail = {
	agentsUsed: AgentKind[];
	candidateResults: CandidateResult[];
	candidateScores: JudgeScore[];
	classification: TaskClassification;
	commandsRun: number;
	confidence: number;
	costUsd: number;
	filesChanged: FileChangeSummary[];
	generatedAt: string;
	humanInterventions: HumanIntervention[];
	id: string;
	latencyMs: number;
	recommendation: ReportRecommendation;
	risks: RiskFinding[];
	routing: RoutingDecision;
	runIds: string[];
	sessionId: string;
	summary: string;
	synthesis: SynthesisResult;
	task: string;
	verification: CandidateVerificationSummary[];
	workspaceId: string;
	winningCandidateId?: string;
};
