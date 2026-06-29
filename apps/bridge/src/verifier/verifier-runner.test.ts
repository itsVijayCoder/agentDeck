import { describe, expect, it } from "vitest";

import { BridgeVerifierRunner, verificationStatusFromRunStatus } from "./verifier-runner.js";
import type { BridgeEventDraft } from "../types.js";
import type { Verifier } from "@agentdeck/verifier";

describe("BridgeVerifierRunner", () => {
	it("emits verifier events and uploads output when an R2 writer is available", async () => {
		const events: BridgeEventDraft[] = [];
		const verifier = fakeVerifier();
		const runner = new BridgeVerifierRunner({
			r2Writer: {
				writeVerifierOutput: async (input) => ({
					artifactId: input.artifactId ?? "artifact-1",
					objectKey: `artifacts/${input.artifactId}.txt`,
					redactionStatus: "none",
					uploaded: true,
				}),
			},
			sink: { emit: (event) => events.push(event) },
			verifiers: [verifier],
		});

		const results = await runner.run({
			repoPath: "/repo",
			runId: "run-1",
			sessionId: "session-1",
			workspaceId: "workspace-1",
		});

		expect(results).toHaveLength(2);
		expect(events.map((event) => event.type)).toEqual([
			"run.verifying",
			"verifier.started",
			"verifier.output",
			"verifier.completed",
			"verifier.started",
			"verifier.completed",
		]);
		expect(events[2]).toMatchObject({
			payload: { outputRef: "artifacts/result-pass.txt", verifierId: "result-pass" },
			visibility: "metadata",
		});
		expect(events[5]).toMatchObject({
			payload: { status: "warning" },
		});
	});

	it("falls back to local-only inline output when uploads are unavailable", async () => {
		const events: BridgeEventDraft[] = [];
		const runner = new BridgeVerifierRunner({
			sink: { emit: (event) => events.push(event) },
			verifiers: [fakeVerifier()],
		});

		await runner.run({
			repoPath: "/repo",
			runId: "run-1",
			sessionId: "session-1",
			workspaceId: "workspace-1",
		});

		expect(events[2]).toMatchObject({
			payload: { outputInline: "ok", verifierId: "result-pass" },
			visibility: "local-only",
		});
	});

	it("maps verifier run status to core verification status", () => {
		expect(verificationStatusFromRunStatus("passed")).toBe("passed");
		expect(verificationStatusFromRunStatus("skipped")).toBe("warning");
		expect(verificationStatusFromRunStatus("failed")).toBe("failed");
		expect(verificationStatusFromRunStatus("cancelled")).toBe("failed");
	});
});

function fakeVerifier(): Verifier {
	return {
		detect: async () => true,
		displayName: "Fake",
		id: "fake",
		plan: async () => [],
		run: async () => [
			{
				command: "pnpm test",
				durationMs: 10,
				exitCode: 0,
				id: "result-pass",
				kind: "test",
				output: "ok",
				status: "passed",
				summary: "passed",
				verifierId: "fake",
			},
			{
				command: "pnpm build",
				durationMs: 0,
				id: "result-skip",
				kind: "build",
				output: "",
				status: "skipped",
				summary: "missing script",
				verifierId: "fake",
			},
		],
	};
}
