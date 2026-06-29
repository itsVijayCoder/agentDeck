import type { BridgeArtifactUploadMessage, PrivacyMode } from "@agentdeck/core";
import { getPrivacyStorageDecision } from "@agentdeck/policy";

import { redact } from "../redaction/secrets.js";

export type ArtifactUploadKind = "patch-diff" | "terminal-log" | "transcript" | "verifier-output";

export type ArtifactUploadResult =
	| {
			artifactId: string;
			objectKey: string;
			redactionStatus: "none" | "redacted";
			uploaded: true;
	  }
	| {
			reason: string;
			uploaded: false;
	  };

export type R2WriterOptions = {
	privacyMode: PrivacyMode;
	send: (message: BridgeArtifactUploadMessage) => boolean | void | Promise<boolean | void>;
};

export class R2Writer {
	constructor(private readonly options: R2WriterOptions) {}

	async writeArtifact(input: {
		artifactId?: string;
		data: string;
		kind: ArtifactUploadKind;
		mimeType: string;
		objectKey: string;
		runId?: string;
	}): Promise<ArtifactUploadResult> {
		const storageDecision = getPrivacyStorageDecision(this.options.privacyMode);
		if (storageDecision.r2 === "blocked") {
			return {
				reason: "R2 writes are blocked by local-only privacy mode.",
				uploaded: false,
			};
		}

		const artifactId = input.artifactId ?? crypto.randomUUID();
		const redactionStatus = storageDecision.r2 === "redacted" ? "redacted" : "none";
		const payload = redactionStatus === "redacted" ? redact(input.data) : input.data;

		const sent = await this.options.send({
			artifactId,
			data: payload,
			kind: input.kind,
			mimeType: input.mimeType,
			objectKey: input.objectKey,
			redactionStatus,
			...(input.runId ? { runId: input.runId } : {}),
			type: "artifact.upload",
		});

		if (sent === false) {
			return {
				reason: "Artifact upload could not be sent to SessionHub.",
				uploaded: false,
			};
		}

		return {
			artifactId,
			objectKey: input.objectKey,
			redactionStatus,
			uploaded: true,
		};
	}

	writeTerminalLog(input: { data: string; runId: string; sessionId: string; workspaceId: string }): Promise<ArtifactUploadResult> {
		return this.writeArtifact({
			data: input.data,
			kind: "terminal-log",
			mimeType: "text/plain; charset=utf-8",
			objectKey: `workspaces/${input.workspaceId}/sessions/${input.sessionId}/terminal/${input.runId}.ansi`,
			runId: input.runId,
		});
	}

	writeTranscript(input: {
		events: readonly unknown[];
		runId: string;
		sessionId: string;
		workspaceId: string;
	}): Promise<ArtifactUploadResult> {
		return this.writeArtifact({
			data: input.events.map((event) => JSON.stringify(event)).join("\n"),
			kind: "transcript",
			mimeType: "application/x-ndjson",
			objectKey: `workspaces/${input.workspaceId}/sessions/${input.sessionId}/transcripts/${input.runId}.jsonl`,
			runId: input.runId,
		});
	}

	writePatch(input: {
		artifactId?: string;
		diff: string;
		runId: string;
		sessionId: string;
		workspaceId: string;
	}): Promise<ArtifactUploadResult> {
		const artifactId = input.artifactId ?? crypto.randomUUID();
		return this.writeArtifact({
			artifactId,
			data: input.diff,
			kind: "patch-diff",
			mimeType: "text/x-diff; charset=utf-8",
			objectKey: `workspaces/${input.workspaceId}/sessions/${input.sessionId}/artifacts/${artifactId}/patch.diff`,
			runId: input.runId,
		});
	}

	writeVerifierOutput(input: {
		artifactId?: string;
		output: string;
		runId: string;
		sessionId: string;
		workspaceId: string;
	}): Promise<ArtifactUploadResult> {
		const artifactId = input.artifactId ?? crypto.randomUUID();
		return this.writeArtifact({
			artifactId,
			data: input.output,
			kind: "verifier-output",
			mimeType: "text/plain; charset=utf-8",
			objectKey: `workspaces/${input.workspaceId}/sessions/${input.sessionId}/artifacts/${artifactId}/verifier-output.txt`,
			runId: input.runId,
		});
	}
}
