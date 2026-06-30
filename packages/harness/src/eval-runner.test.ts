import { describe, expect, it } from "vitest";

import { runEval, summarizeEvalResults, type EvalDataset } from "./eval-runner.js";
import type { HarnessAdapter, HarnessSessionHandle } from "./types.js";

const dataset: EvalDataset = {
	id: "bugfix-2",
	name: "Bugfix smoke",
	tasks: [
		{
			category: "bugfix",
			expectedFilesChanged: ["src/range.ts"],
			expectedTestsPass: true,
			id: "bf-001",
			prompt: "Fix range off by one",
		},
	],
};

describe("eval runner", () => {
	it("runs datasets through a harness adapter and summarizes results", async () => {
		let disposed = false;
		const adapter = createMockAdapter({
			async start() {
				// completed
			},
			async dispose() {
				disposed = true;
			},
		});
		let timestamp = 0;

		const results = await runEval(dataset, adapter, {
			model: "gpt-5",
			now: () => (timestamp += 25),
			runId: () => "run_eval",
			sessionId: () => "session_eval",
		});

		expect(disposed).toBe(true);
		expect(results).toEqual([
			{
				agentKind: "codex",
				costUsd: 0,
				filesChanged: ["src/range.ts"],
				latencyMs: 25,
				model: "gpt-5",
				reason: "Completed",
				score: 1,
				status: "passed",
				taskId: "bf-001",
				testsPassed: true,
			},
		]);
		expect(summarizeEvalResults(results)).toEqual({
			avgLatencyMs: 25,
			avgScore: 1,
			failed: 0,
			passed: 1,
			total: 1,
		});
	});

	it("records adapter failures without aborting the dataset", async () => {
		const adapter = createMockAdapter({
			async start() {
				throw new Error("agent unavailable");
			},
		});

		const results = await runEval(dataset, adapter, {
			now: () => 100,
			runId: () => "run_eval",
			sessionId: () => "session_eval",
		});

		expect(results).toMatchObject([{ reason: "agent unavailable", score: 0, status: "failed" }]);
		expect(summarizeEvalResults([])).toEqual({ avgLatencyMs: 0, avgScore: 0, failed: 0, passed: 0, total: 0 });
	});
});

function createMockAdapter(overrides: Partial<HarnessSessionHandle>): HarnessAdapter {
	return {
		displayName: "Codex",
		id: "codex",
		kind: "codex",
		async createSession(ctx) {
			return {
				agentKind: "codex",
				runId: ctx.runId,
				async approve() {
					// not used in eval smoke tests
				},
				async cancel() {
					// not used in eval smoke tests
				},
				async dispose() {
					// default dispose
				},
				async pause() {
					// not used in eval smoke tests
				},
				async resume() {
					// not used in eval smoke tests
				},
				async sendTerminalInput() {
					// not used in eval smoke tests
				},
				async sendUserMessage() {
					// not used in eval smoke tests
				},
				async start() {
					// default start
				},
				...overrides,
			};
		},
		async probe() {
			return {
				agentKind: "codex",
				authStatus: "configured",
				capabilities: ["terminal"],
				found: true,
				warnings: [],
			};
		},
	};
}
