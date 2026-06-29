import { describe, expect, it } from "vitest";
import type { CandidateResult } from "@agentdeck/core";

import { classifyTask } from "./classifier.js";
import { judgeCandidates } from "./judge.js";
import { generateDecisionReportDetail } from "./report-generator.js";
import { routeTask } from "./router.js";
import { synthesizeCandidates } from "./synthesis.js";

describe("task orchestration helpers", () => {
	it("classifies critical, hard, and simple work with stable strategies", () => {
		expect(classifyTask("Fix security credential leak")).toMatchObject({
			category: "security",
			complexity: "critical",
			suggestedStrategy: "frontier-fallback",
		});
		expect(classifyTask("Migrate database schema for billing records")).toMatchObject({
			category: "migration",
			complexity: "critical",
			suggestedStrategy: "frontier-fallback",
		});
		expect(classifyTask("Upgrade dependency lockfile")).toMatchObject({
			category: "dependency-update",
			complexity: "hard",
			suggestedStrategy: "cascade",
		});
		expect(classifyTask("Fix flaky login bug")).toMatchObject({
			category: "bugfix",
			complexity: "medium",
			suggestedStrategy: "single",
		});
		expect(classifyTask("Generate coverage fixtures")).toMatchObject({
			category: "test-generation",
			complexity: "simple",
			suggestedStrategy: "single",
		});
		expect(classifyTask("Redesign the orchestration architecture")).toMatchObject({
			category: "refactor",
			complexity: "hard",
			suggestedStrategy: "parallel-candidates",
		});
		expect(classifyTask("Add docs for bridge pairing")).toMatchObject({
			category: "docs",
			complexity: "simple",
			suggestedStrategy: "single",
		});
		expect(classifyTask("Add task inbox filters")).toMatchObject({
			category: "feature",
			complexity: "medium",
			suggestedStrategy: "single",
		});
	});

	it("routes parallel candidates while respecting local-only privacy", () => {
		const hard = classifyTask("Refactor the queue orchestration flow");
		const parallel = routeTask(hard, ["claude-code", "codex", "pi"], "metadata-only");
		const local = routeTask(hard, ["claude-code", "codex", "pi"], "local-only");

		expect(parallel).toMatchObject({
			strategy: "parallel-candidates",
			candidates: [
				{ agentKind: "claude-code", id: "candidate-a" },
				{ agentKind: "codex", id: "candidate-b" },
				{ agentKind: "pi", id: "candidate-c" },
			],
		});
		expect(local).toMatchObject({
			strategy: "single",
			candidates: [{ agentKind: "pi", id: "candidate-a" }],
		});
	});

	it("routes fallback, cascade, local-only, and empty-agent branches", () => {
		const critical = classifyTask("Deploy database migration");
		const fallback = routeTask(critical, ["pi", "codex", "claude-code"], "metadata-only");
		const cascade = routeTask(classifyTask("Update dependency graph"), ["codex", "opencode"], "metadata-only");
		const localOnly = routeTask(classifyTask("Refactor private repo"), ["pi", "opencode"], "local-only", {
			requestedStrategy: "local-only",
		});
		const empty = routeTask(classifyTask("Refactor private repo"), ["claude-code"], "local-only", {
			requestedStrategy: "parallel-candidates",
		});
		const capped = routeTask(classifyTask("Refactor billing service"), ["codex", "codex", "opencode"], "metadata-only", {
			maxCandidates: 1,
			model: "model-1",
			provider: "provider-1",
		});

		expect(fallback.candidates.map((candidate) => candidate.agentKind)).toEqual(["claude-code", "codex"]);
		expect(cascade).toMatchObject({ strategy: "cascade", budgetUsd: 1.5 });
		expect(localOnly).toMatchObject({ strategy: "local-only", candidates: [{ agentKind: "pi" }] });
		expect(empty).toMatchObject({ strategy: "single", candidates: [] });
		expect(capped.candidates).toEqual([
			expect.objectContaining({
				agentKind: "codex",
				model: "model-1",
				provider: "provider-1",
			}),
		]);
	});

	it("scores completed verified candidates ahead of failed candidates", () => {
		const results = [
			candidate({ candidateId: "candidate-a", status: "completed", verifierStatus: "passed" }),
			candidate({ candidateId: "candidate-b", status: "failed", verifierStatus: "failed" }),
		] satisfies CandidateResult[];

		const scores = judgeCandidates(results);

		expect(scores[0]).toMatchObject({
			candidateId: "candidate-a",
			recommendation: "accept",
		});
		expect(scores[0].totalScore).toBeGreaterThan(scores[1].totalScore);
		expect(scores[1].recommendation).toBe("reject");
	});

	it("scores warning, missing-verifier, high-risk, and timeout candidates", () => {
		const scores = judgeCandidates([
			candidate({ candidateId: "candidate-a", status: "completed", verifierStatus: "warning" }),
			{
				...candidate({ candidateId: "candidate-b", status: "completed", verifierStatus: "passed" }),
				costUsd: 3,
				diff: { additions: 900, deletions: 200, filesChanged: 14 },
				latencyMs: 30 * 60_000,
				riskFindings: [{ description: "Touches deployment policy", severity: "critical" }],
				verifierResults: [],
			},
			candidate({ candidateId: "candidate-c", status: "timeout", verifierStatus: "failed" }),
		]);

		expect(scores.find((score) => score.candidateId === "candidate-a")?.recommendation).toBe("review-carefully");
		expect(scores.find((score) => score.candidateId === "candidate-b")?.breakdown.safety).toBeLessThan(0.2);
		expect(scores.find((score) => score.candidateId === "candidate-c")?.totalScore).toBe(0);
	});

	it("scores medium diffs, lower risks, higher costs, and low completed scores", () => {
		const scores = judgeCandidates([
			{
				...candidate({ candidateId: "candidate-a", status: "completed", verifierStatus: "failed" }),
				costUsd: 0.4,
				diff: { additions: 180, deletions: 50, filesChanged: 5 },
				latencyMs: 4 * 60_000,
				riskFindings: [{ description: "Touches config", severity: "medium" }],
			},
			{
				...candidate({ candidateId: "candidate-b", status: "completed", verifierStatus: "failed" }),
				costUsd: 1.5,
				diff: { additions: 500, deletions: 80, filesChanged: 10 },
				latencyMs: 10 * 60_000,
				policyFit: -1,
				riskFindings: [{ description: "Touches docs", severity: "low" }],
			},
			{
				...candidate({ candidateId: "candidate-c", status: "completed", verifierStatus: "failed" }),
				diff: undefined,
				policyFit: 2,
				riskFindings: [{ description: "Touches workflow", severity: "high" }],
			},
		]);

		expect(scores.some((score) => score.recommendation === "reject")).toBe(true);
		expect(scores.find((score) => score.candidateId === "candidate-a")?.breakdown.minimality).toBe(0.75);
		expect(scores.find((score) => score.candidateId === "candidate-b")?.breakdown.minimality).toBe(0.55);
		expect(scores.find((score) => score.candidateId === "candidate-c")?.breakdown.minimality).toBe(0.7);
	});

	it("reruns synthesis when no candidate is acceptable and reviews close scores", () => {
		expect(synthesizeCandidates([], [])).toMatchObject({
			recommendation: "rerun",
			strategy: "rerun",
		});
		expect(
			synthesizeCandidates([candidate({ candidateId: "candidate-a", status: "failed", verifierStatus: "failed" })], [
				{
					breakdown: {
						correctness: 0,
						costLatency: 0,
						humanPreference: 0,
						minimality: 0,
						safety: 0,
						verification: 0,
					},
					candidateId: "candidate-a",
					recommendation: "reject",
					runId: "candidate-a",
					totalScore: 0,
				},
			]),
		).toMatchObject({ recommendation: "rerun", strategy: "rerun" });
		expect(
			synthesizeCandidates(
				[
					candidate({ candidateId: "candidate-a", runId: "run_a", status: "completed", verifierStatus: "passed" }),
					candidate({ candidateId: "candidate-b", runId: "run_b", status: "completed", verifierStatus: "passed" }),
				],
				[
					{
						breakdown: {
							correctness: 1,
							costLatency: 1,
							humanPreference: 1,
							minimality: 1,
							safety: 1,
							verification: 1,
						},
						candidateId: "candidate-a",
						recommendation: "accept",
						runId: "run_a",
						totalScore: 0.91,
					},
					{
						breakdown: {
							correctness: 1,
							costLatency: 1,
							humanPreference: 1,
							minimality: 1,
							safety: 1,
							verification: 1,
						},
						candidateId: "candidate-b",
						recommendation: "accept",
						runId: "run_b",
						totalScore: 0.88,
					},
				],
			),
		).toMatchObject({ recommendation: "review-carefully", winningCandidateId: "candidate-a" });
	});

	it("synthesizes the leading candidate and maps a full report", () => {
		const classification = classifyTask("Fix flaky auth refresh test");
		const routing = routeTask(classification, ["codex", "opencode"], "metadata-only", {
			requestedStrategy: "parallel-candidates",
		});
		const candidates = [
			candidate({ candidateId: "candidate-a", runId: "run_a", status: "completed", verifierStatus: "passed" }),
			candidate({ candidateId: "candidate-b", runId: "run_b", status: "completed", verifierStatus: "warning" }),
		] satisfies CandidateResult[];
		const scores = judgeCandidates(candidates);
		const synthesis = synthesizeCandidates(candidates, scores);
		const report = generateDecisionReportDetail({
			candidates,
			classification,
			id: "report_01",
			routing,
			scores,
			sessionId: "session_01",
			synthesis,
			task: "Fix flaky auth refresh test",
			workspaceId: "ws_01",
		});

		expect(synthesis).toMatchObject({
			strategy: "select-best",
			winningCandidateId: "candidate-a",
		});
		expect(report).toMatchObject({
			commandsRun: 2,
			id: "report_01",
			recommendation: "accept",
			runIds: ["run_a", "run_b"],
			winningCandidateId: "candidate-a",
		});
		expect(report.candidateScores).toHaveLength(2);
	});

	it("maps reports with supplied file and human intervention summaries", () => {
		const classification = classifyTask("Add task inbox filters");
		const routing = routeTask(classification, ["codex"], "metadata-only");
		const candidates = [candidate({ candidateId: "candidate-a", status: "completed", verifierStatus: "passed" })];
		const scores = judgeCandidates(candidates);
		const synthesis = synthesizeCandidates(candidates, scores);
		const report = generateDecisionReportDetail({
			candidates,
			classification,
			filesChanged: [{ additions: 1, deletions: 0, path: "src/inbox.ts" }],
			generatedAt: "2026-06-29T00:00:00.000Z",
			humanInterventions: [{ description: "Approved command", timestamp: "2026-06-29T00:01:00.000Z", type: "command" }],
			id: "report_02",
			routing,
			scores,
			sessionId: "session_02",
			synthesis,
			task: "Add task inbox filters",
			workspaceId: "ws_01",
		});

		expect(report.generatedAt).toBe("2026-06-29T00:00:00.000Z");
		expect(report.filesChanged).toEqual([{ additions: 1, deletions: 0, path: "src/inbox.ts" }]);
		expect(report.humanInterventions).toHaveLength(1);
	});

	it("maps reports without winning candidates or candidate evidence", () => {
		const classification = classifyTask("Add task inbox filters");
		const routing = routeTask(classification, [], "metadata-only");
		const report = generateDecisionReportDetail({
			candidates: [],
			classification,
			id: "report_empty",
			routing,
			scores: [],
			sessionId: "session_empty",
			synthesis: {
				reason: "No candidates produced comparable output.",
				recommendation: "rerun",
				strategy: "rerun",
			},
			task: "Add task inbox filters",
			workspaceId: "ws_01",
		});

		expect(report.confidence).toBe(0);
		expect(report.filesChanged).toEqual([]);
		expect(report).not.toHaveProperty("winningCandidateId");
	});
});

function candidate(input: {
	candidateId: string;
	status: CandidateResult["status"];
	verifierStatus: "failed" | "passed" | "warning";
	runId?: string;
}): CandidateResult {
	return {
		agentKind: input.candidateId === "candidate-a" ? "codex" : "opencode",
		candidateId: input.candidateId,
		diff: {
			additions: 18,
			deletions: 4,
			filesChanged: 2,
		},
		label: input.candidateId,
		latencyMs: input.candidateId === "candidate-a" ? 45_000 : 180_000,
		runId: input.runId ?? input.candidateId,
		status: input.status,
		verifierResults: [
			{
				command: "pnpm test",
				id: `${input.candidateId}-test`,
				status: input.verifierStatus,
			},
		],
	};
}
