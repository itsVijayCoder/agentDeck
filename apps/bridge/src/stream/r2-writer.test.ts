import { describe, expect, it } from "vitest";

import { R2Writer } from "./r2-writer.js";
import type { BridgeArtifactUploadMessage } from "@agentdeck/core";

describe("R2Writer", () => {
	it("blocks local-only uploads", async () => {
		const messages: BridgeArtifactUploadMessage[] = [];
		const writer = new R2Writer({
			privacyMode: "local-only",
			send: (message) => {
				messages.push(message);
			},
		});

		await expect(
			writer.writeTerminalLog({
				data: "secret",
				runId: "run-1",
				sessionId: "session-1",
				workspaceId: "workspace-1",
			}),
		).resolves.toEqual({
			reason: "R2 writes are blocked by local-only privacy mode.",
			uploaded: false,
		});
		expect(messages).toEqual([]);
	});

	it("redacts metadata-only uploads before sending", async () => {
		const messages: BridgeArtifactUploadMessage[] = [];
		const writer = new R2Writer({
			privacyMode: "metadata-only",
			send: (message) => {
				messages.push(message);
			},
		});

		const result = await writer.writePatch({
			artifactId: "artifact-1",
			diff: "+OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz",
			runId: "run-1",
			sessionId: "session-1",
			workspaceId: "workspace-1",
		});

		expect(result).toEqual({
			artifactId: "artifact-1",
			objectKey: "workspaces/workspace-1/sessions/session-1/artifacts/artifact-1/patch.diff",
			redactionStatus: "redacted",
			uploaded: true,
		});
		expect(messages).toEqual([
			expect.objectContaining({
				data: "+OPENAI_API_KEY=[REDACTED]",
				redactionStatus: "redacted",
				type: "artifact.upload",
			}),
		]);
	});

	it("sends full-sync uploads without redaction and reports send failures", async () => {
		const messages: BridgeArtifactUploadMessage[] = [];
		const writer = new R2Writer({
			privacyMode: "full-sync",
			send: (message) => {
				messages.push(message);
				return false;
			},
		});

		await expect(
			writer.writeVerifierOutput({
				artifactId: "artifact-2",
				output: "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz",
				runId: "run-1",
				sessionId: "session-1",
				workspaceId: "workspace-1",
			}),
		).resolves.toEqual({
			reason: "Artifact upload could not be sent to SessionHub.",
			uploaded: false,
		});
		expect(messages[0]).toMatchObject({
			data: "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz",
			redactionStatus: "none",
		});
	});

	it("formats transcript uploads as newline-delimited JSON", async () => {
		const messages: BridgeArtifactUploadMessage[] = [];
		const writer = new R2Writer({
			privacyMode: "full-sync",
			send: (message) => {
				messages.push(message);
			},
		});

		await writer.writeTranscript({
			events: [{ type: "run.started" }, { type: "run.completed" }],
			runId: "run-1",
			sessionId: "session-1",
			workspaceId: "workspace-1",
		});

		expect(messages[0]).toMatchObject({
			data: "{\"type\":\"run.started\"}\n{\"type\":\"run.completed\"}",
			kind: "transcript",
			mimeType: "application/x-ndjson",
			objectKey: "workspaces/workspace-1/sessions/session-1/transcripts/run-1.jsonl",
		});
	});
});
