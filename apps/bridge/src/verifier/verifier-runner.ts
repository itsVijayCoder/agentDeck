import {
	detectVerifiers,
	type Verifier,
	type VerifierResult,
	type VerifyContext,
	type VerifierRunStatus,
} from "@agentdeck/verifier";
import type { VerificationStatus } from "@agentdeck/core";

import type { EventSink } from "../stream/event-sink.js";
import type { R2Writer } from "../stream/r2-writer.js";

export type BridgeVerifierRunnerOptions = {
	r2Writer?: Pick<R2Writer, "writeVerifierOutput">;
	sink: Pick<EventSink, "emit">;
	verifiers?: readonly Verifier[];
};

export type RunVerificationInput = VerifyContext & {
	runId: string;
	sessionId: string;
	workspaceId: string;
};

export class BridgeVerifierRunner {
	constructor(private readonly options: BridgeVerifierRunnerOptions) {}

	async run(input: RunVerificationInput): Promise<VerifierResult[]> {
		const verifiers = this.options.verifiers
			? await detectVerifiers(input.repoPath, this.options.verifiers)
			: await detectVerifiers(input.repoPath);
		this.options.sink.emit({
			payload: { verifierCount: verifiers.length },
			runId: input.runId,
			source: "bridge",
			type: "run.verifying",
			visibility: "metadata",
		});

		const results: VerifierResult[] = [];
		for (const verifier of verifiers) {
			const verifierResults = await verifier.run(input);
			for (const result of verifierResults) {
				results.push(result);
				await this.emitResult(input, result);
			}
		}

		return results;
	}

	private async emitResult(input: RunVerificationInput, result: VerifierResult): Promise<void> {
		this.options.sink.emit({
			payload: {
				command: result.command,
				verifierId: result.id,
			},
			runId: input.runId,
			source: "verifier",
			type: "verifier.started",
			visibility: "metadata",
		});

		if (result.output) {
			const upload = await this.options.r2Writer?.writeVerifierOutput({
				artifactId: result.id,
				output: result.output,
				runId: input.runId,
				sessionId: input.sessionId,
				workspaceId: input.workspaceId,
			});

			this.options.sink.emit({
				payload: upload?.uploaded
					? { outputRef: upload.objectKey, verifierId: result.id }
					: { outputInline: result.output, verifierId: result.id },
				runId: input.runId,
				source: "verifier",
				type: "verifier.output",
				visibility: upload?.uploaded ? "metadata" : "local-only",
			});
		}

		this.options.sink.emit({
			payload: {
				durationMs: result.durationMs,
				status: verificationStatusFromRunStatus(result.status),
				verifierId: result.id,
			},
			runId: input.runId,
			source: "verifier",
			type: "verifier.completed",
			visibility: "metadata",
		});
	}
}

export function verificationStatusFromRunStatus(status: VerifierRunStatus): VerificationStatus {
	switch (status) {
		case "passed":
			return "passed";
		case "skipped":
			return "warning";
		case "cancelled":
		case "failed":
			return "failed";
	}
}
