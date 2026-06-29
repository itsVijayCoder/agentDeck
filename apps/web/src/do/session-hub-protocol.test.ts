import { describe, expect, it } from "vitest";

import {
	bridgeMessageToEventDrafts,
	browserControlForBridge,
	browserControlToEventDraft,
	parseBridgeArtifactUploadMessage,
	parseBrowserControlMessage,
	shouldStorePayloadInR2,
	visibilityForEvent,
} from "./session-hub-protocol";

describe("session hub protocol helpers", () => {
	it("normalizes bridge heartbeat messages into event drafts", () => {
		const drafts = bridgeMessageToEventDrafts({
			machineId: "machine_01",
			sentAt: "2026-06-28T00:00:00.000Z",
			type: "machine.heartbeat",
		});

		expect(drafts).toEqual([
			{
				payload: { machineId: "machine_01", sentAt: "2026-06-28T00:00:00.000Z" },
				source: "bridge",
				type: "machine.heartbeat",
				visibility: "metadata",
			},
		]);
	});

	it("normalizes event batches without trusting caller sequence numbers", () => {
		const drafts = bridgeMessageToEventDrafts({
			events: [
				{
					payload: { data: "hello" },
					runId: "run_01",
					seq: 999,
					source: "agent",
					type: "terminal.stdout",
					visibility: "local-only",
				},
			],
			type: "event.batch",
		});

		expect(drafts).toEqual([
			{
				payload: { data: "hello" },
				runId: "run_01",
				source: "agent",
				type: "terminal.stdout",
				visibility: "local-only",
			},
		]);
	});

	it("parses browser controls and maps persisted control events", () => {
		const control = parseBrowserControlMessage({
			reason: "Need a breakpoint",
			runId: "run_01",
			type: "control.pause",
		});

		expect(control).toEqual({
			reason: "Need a breakpoint",
			runId: "run_01",
			type: "control.pause",
		});
		expect(control ? browserControlToEventDraft(control, "user_01") : null).toEqual({
			payload: { reason: "Need a breakpoint" },
			runId: "run_01",
			source: "browser",
			type: "run.paused",
			visibility: "metadata",
		});
	});

	it("injects authenticated browser identity into terminal controls forwarded to the bridge", () => {
		expect(
			browserControlForBridge(
				{
					data: "ls\n",
					runId: "run_01",
					type: "terminal.stdin",
				},
				"user_01",
			),
		).toEqual({
			data: "ls\n",
			runId: "run_01",
			type: "terminal.stdin",
			userId: "user_01",
		});

		expect(
			browserControlForBridge(
				{
					mode: "human-control",
					runId: "run_01",
					type: "terminal.lease.request",
				},
				"user_01",
			),
		).toEqual({
			mode: "human-control",
			runId: "run_01",
			type: "terminal.lease.request",
			userId: "user_01",
		});
		expect(
			browserControlForBridge(
				{
					approvalId: "approval_01",
					status: "approved",
					type: "approval.decide",
				},
				"user_01",
			),
		).toEqual({
			approvalId: "approval_01",
			status: "approved",
			type: "approval.decide",
			userId: "user_01",
		});
	});

	it("parses bridge artifact uploads outside the event batch path", () => {
		expect(
			parseBridgeArtifactUploadMessage({
				artifactId: "artifact_01",
				data: "patch",
				kind: "patch-diff",
				mimeType: "text/x-diff",
				objectKey: "workspaces/ws/sessions/session/artifacts/artifact_01/patch.diff",
				redactionStatus: "redacted",
				runId: "run_01",
				type: "artifact.upload",
			}),
		).toEqual({
			artifactId: "artifact_01",
			data: "patch",
			kind: "patch-diff",
			mimeType: "text/x-diff",
			objectKey: "workspaces/ws/sessions/session/artifacts/artifact_01/patch.diff",
			redactionStatus: "redacted",
			runId: "run_01",
			type: "artifact.upload",
		});
		expect(parseBridgeArtifactUploadMessage({ data: "patch", type: "artifact.upload" })).toBeNull();
		expect(parseBridgeArtifactUploadMessage({ type: "event.batch" })).toBeNull();
	});

	it("keeps terminal visibility local unless full sync is enabled", () => {
		expect(visibilityForEvent("terminal.stdout", "metadata-only")).toBe("local-only");
		expect(visibilityForEvent("terminal.stdout", "full-sync")).toBe("full");
		expect(visibilityForEvent("agent.detected", "metadata-only")).toBe("metadata");
	});

	it("routes sync-eligible terminal recordings and large payloads to R2", () => {
		expect(
			shouldStorePayloadInR2({
				payloadBytes: 120,
				privacyMode: "metadata-only",
				type: "terminal.stdout",
			}),
		).toBe(true);
		expect(
			shouldStorePayloadInR2({
				payloadBytes: 20_000,
				privacyMode: "local-only",
				type: "terminal.stdout",
			}),
		).toBe(false);
		expect(
			shouldStorePayloadInR2({
				payloadBytes: 120,
				privacyMode: "full-sync",
				type: "agent.detected",
			}),
		).toBe(false);
	});
});
