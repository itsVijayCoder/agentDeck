import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
	createApprovalInputSchema,
	createArtifactInputSchema,
	createDecisionReportInputSchema,
	createQueueItemInputSchema,
	createRunInputSchema,
	createSessionInputSchema,
	createWorkspaceInputSchema,
	decideApprovalInputSchema,
	jsonRecordSchema,
	jsonValueSchema,
	openFusionEventSchema,
	openFusionEventTypes,
	parsePersistEventInput,
	persistEventInputSchema,
	updateRunStatusInputSchema,
	upsertAgentInstallationInputSchema,
	upsertMachineInputSchema,
	upsertPolicyRuleInputSchema,
	upsertScheduledJobInputSchema,
} from "@/lib/validators";
import type { OpenFusionEvent } from "@/types/openfusion-events";

const now = "2026-06-28T00:00:00.000Z";
const sha256 = "a".repeat(64);

type SchemaCase = {
	input: unknown;
	name: string;
	schema: z.ZodType<unknown>;
};

const sampleEvent: OpenFusionEvent = {
	createdAt: now,
	id: "evt_01",
	payload: { title: "Foundation", privacyMode: "metadata-only" },
	seq: 0,
	sessionId: "sess_01",
	source: "browser",
	type: "session.created",
	visibility: "metadata",
	workspaceId: "ws_01",
};

const validSchemaCases: SchemaCase[] = [
	{
		input: {
			createdAt: now,
			defaultBranch: "main",
			id: "ws_01",
			name: "OpenFusion",
			privacyMode: "metadata-only",
			repositoryUrl: "https://github.com/example/openfusion",
			updatedAt: now,
		},
		name: "CreateWorkspaceInput",
		schema: createWorkspaceInputSchema,
	},
	{
		input: {
			arch: "arm64",
			bridgeVersion: "0.1.0",
			displayName: "Mac Studio",
			id: "machine_01",
			lastSeenAt: now,
			os: "darwin",
			status: "online",
			workspaceId: "ws_01",
		},
		name: "UpsertMachineInput",
		schema: upsertMachineInputSchema,
	},
	{
		input: {
			agentKind: "codex",
			authStatus: "configured",
			capabilities: ["terminal", "code-edit"],
			command: "codex",
			id: "agent_01",
			machineId: "machine_01",
			version: "1.0.0",
		},
		name: "UpsertAgentInstallationInput",
		schema: upsertAgentInstallationInputSchema,
	},
	{
		input: {
			createdBy: "user_01",
			id: "sess_01",
			privacyMode: "metadata-only",
			title: "Foundation",
			workspaceId: "ws_01",
		},
		name: "CreateSessionInput",
		schema: createSessionInputSchema,
	},
	{
		input: {
			branchName: "feature/foundation",
			confidence: 0.5,
			id: "run_01",
			sessionId: "sess_01",
			status: "running",
			task: "Wire quality gates",
		},
		name: "CreateRunInput",
		schema: createRunInputSchema,
	},
	{
		input: {
			completedAt: now,
			confidence: 0.95,
			id: "run_01",
			latencyMs: 125,
			status: "completed",
		},
		name: "UpdateRunStatusInput",
		schema: updateRunStatusInputSchema,
	},
	{
		input: { event: sampleEvent, objectKey: "events/ws_01/sess_01/evt_01.json" },
		name: "PersistEventInput",
		schema: persistEventInputSchema,
	},
	{
		input: {
			id: "approval_01",
			kind: "command",
			requestedAction: { command: "npm install" },
			risk: "medium",
			runId: "run_01",
			sessionId: "sess_01",
			title: "Install dependencies",
			workspaceId: "ws_01",
		},
		name: "CreateApprovalInput",
		schema: createApprovalInputSchema,
	},
	{
		input: {
			decidedBy: "user_01",
			decision: { notes: "Approved once" },
			id: "approval_01",
			status: "approved",
		},
		name: "DecideApprovalInput",
		schema: decideApprovalInputSchema,
	},
	{
		input: {
			agentSelector: { kind: "codex" },
			createdBy: "user_01",
			id: "queue_01",
			maxCostUsd: 10,
			maxRuntimeMinutes: 30,
			priority: "normal",
			task: "Run overnight cleanup",
			workspaceId: "ws_01",
		},
		name: "CreateQueueItemInput",
		schema: createQueueItemInputSchema,
	},
	{
		input: {
			agentSelector: { kind: "codex" },
			cron: "0 8 * * *",
			enabled: true,
			id: "schedule_01",
			machineSelector: { os: "darwin" },
			name: "Morning report",
			naturalLanguage: "Run every morning",
			taskTemplate: "Summarize the repo",
			timezone: "Asia/Kolkata",
			workspaceId: "ws_01",
		},
		name: "UpsertScheduledJobInput",
		schema: upsertScheduledJobInputSchema,
	},
	{
		input: {
			id: "artifact_01",
			kind: "terminal-log",
			mimeType: "text/plain",
			objectKey: "artifacts/log.txt",
			redactionStatus: "redacted",
			sessionId: "sess_01",
			sha256,
			sizeBytes: 2048,
			workspaceId: "ws_01",
		},
		name: "CreateArtifactInput",
		schema: createArtifactInputSchema,
	},
	{
		input: {
			confidence: 0.86,
			id: "report_01",
			recommendation: "review-carefully",
			report: { summary: "Review changes" },
			sessionId: "sess_01",
			summary: "Candidate comparison complete",
			workspaceId: "ws_01",
		},
		name: "CreateDecisionReportInput",
		schema: createDecisionReportInputSchema,
	},
	{
		input: {
			action: "Install dependencies",
			defaultDecision: "approval",
			enabled: true,
			id: "policy_01",
			matcher: { command: "npm install" },
			reason: "Supply chain risk",
			risk: "medium",
			workspaceId: "ws_01",
		},
		name: "UpsertPolicyRuleInput",
		schema: upsertPolicyRuleInputSchema,
	},
];

describe("D1 input validators", () => {
	it.each(validSchemaCases)("accepts valid $name", ({ input, schema }) => {
		expect(schema.safeParse(input).success).toBe(true);
	});

	it("covers every D1 input contract from Phase 00", () => {
		expect(validSchemaCases).toHaveLength(14);
	});

	it("rejects blank required strings", () => {
		expect(createSessionInputSchema.safeParse({ createdBy: "user_01", id: "sess_01", privacyMode: "metadata-only", title: " ", workspaceId: "ws_01" }).success).toBe(false);
	});

	it("rejects unknown keys at the repository boundary", () => {
		expect(createWorkspaceInputSchema.safeParse({ id: "ws_01", name: "OpenFusion", privacyMode: "metadata-only", workspaceId: "extra" }).success).toBe(false);
	});

	it("rejects invalid enum values and bounded numbers", () => {
		expect(createRunInputSchema.safeParse({ confidence: 2, id: "run_01", sessionId: "sess_01", status: "missing", task: "Run" }).success).toBe(false);
		expect(createQueueItemInputSchema.safeParse({ createdBy: "user_01", id: "queue_01", maxRuntimeMinutes: 0, priority: "normal", task: "Run", workspaceId: "ws_01" }).success).toBe(false);
	});

	it("rejects invalid ISO timestamps", () => {
		expect(createWorkspaceInputSchema.safeParse({ createdAt: "June 28", id: "ws_01", name: "OpenFusion", privacyMode: "metadata-only" }).success).toBe(false);
	});

	it("rejects invalid artifact hashes", () => {
		expect(
			createArtifactInputSchema.safeParse({
				id: "artifact_01",
				kind: "terminal-log",
				mimeType: "text/plain",
				objectKey: "artifacts/log.txt",
				redactionStatus: "none",
				sessionId: "sess_01",
				sha256: "not-a-sha",
				sizeBytes: 1,
				workspaceId: "ws_01",
			}).success,
		).toBe(false);
	});
});

describe("JSON validators", () => {
	it("accepts nested JSON values and records", () => {
		const value = { flags: [true, false, null], nested: { cost: 1.25, name: "codex" } };

		expect(jsonValueSchema.safeParse(value).success).toBe(true);
		expect(jsonRecordSchema.safeParse(value).success).toBe(true);
	});

	it("rejects non-JSON values", () => {
		expect(jsonValueSchema.safeParse(Number.NaN).success).toBe(false);
		expect(jsonRecordSchema.safeParse(["not", "a", "record"]).success).toBe(false);
	});
});

describe("event envelope validation", () => {
	it("accepts event envelopes from every protocol category", () => {
		const representatives: OpenFusionEvent[] = [
			sampleEvent,
			{ ...sampleEvent, id: "evt_machine", payload: { machineId: "machine_01", bridgeVersion: "0.1.0" }, type: "machine.online" },
			{ ...sampleEvent, id: "evt_agent", payload: { agentKind: "codex", command: "codex" }, type: "agent.detected" },
			{ ...sampleEvent, id: "evt_run", payload: { targetBranch: "main", task: "Run" }, type: "run.created" },
			{ ...sampleEvent, id: "evt_message", payload: { contentInline: "Continue" }, type: "message.user" },
			{ ...sampleEvent, id: "evt_terminal", payload: { cols: 120, rows: 40 }, type: "terminal.open" },
			{ ...sampleEvent, id: "evt_tool", payload: { risk: "low", toolCallId: "tool_01", toolName: "rg" }, type: "tool.start" },
			{ ...sampleEvent, id: "evt_approval", payload: { approvalId: "approval_01", risk: "medium", title: "Install" }, type: "approval.requested" },
			{ ...sampleEvent, id: "evt_verifier", payload: { command: "npm run build", verifierId: "verify_01" }, type: "verifier.started" },
			{ ...sampleEvent, id: "evt_artifact", payload: { artifactId: "artifact_01", kind: "log", objectKey: "logs/1.txt" }, type: "artifact.created" },
			{ ...sampleEvent, id: "evt_queue", payload: { priority: "normal", queueItemId: "queue_01" }, type: "queue.item_created" },
			{ ...sampleEvent, id: "evt_schedule", payload: { runAfter: now, scheduleId: "schedule_01" }, type: "schedule.triggered" },
			{ ...sampleEvent, id: "evt_judge", payload: { candidateRunIds: ["run_01"] }, type: "judge.started" },
			{ ...sampleEvent, id: "evt_synthesis", payload: { winningRunId: "run_01" }, type: "synthesis.completed" },
			{ ...sampleEvent, id: "evt_report", payload: { recommendation: "accept", reportId: "report_01" }, type: "report.created" },
		];

		for (const event of representatives) {
			expect(openFusionEventSchema.safeParse(event).success).toBe(true);
		}
	});

	it("rejects malformed event envelopes", () => {
		expect(openFusionEventSchema.safeParse({ ...sampleEvent, seq: -1 }).success).toBe(false);
		expect(openFusionEventSchema.safeParse({ ...sampleEvent, source: "unknown" }).success).toBe(false);
		expect(openFusionEventSchema.safeParse({ ...sampleEvent, type: "run.unknown" }).success).toBe(false);
	});

	it("parses persisted event input into the typed repository contract", () => {
		expect(parsePersistEventInput({ event: sampleEvent })).toEqual({ event: sampleEvent });
		expect(openFusionEventTypes).toContain("report.created");
	});
});
