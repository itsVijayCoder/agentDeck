import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdapterRegistry, type HarnessAdapter, type HarnessSessionContext, type HarnessSessionHandle } from "@agentdeck/harness";
import type { RunDispatchControlMessage } from "@agentdeck/core";

const mocks = vi.hoisted(() => ({
	createWorktree: vi.fn(),
	generatePatch: vi.fn(),
	runVerifiers: vi.fn(),
	writePatch: vi.fn(),
}));

vi.mock("../repo/worktree.js", () => ({
	createWorktree: mocks.createWorktree,
}));

vi.mock("../repo/patch-generator.js", () => ({
	PatchGenerator: class {
		generate = mocks.generatePatch;
	},
}));

vi.mock("../verifier/verifier-runner.js", () => ({
	BridgeVerifierRunner: class {
		run = mocks.runVerifiers;
	},
}));

vi.mock("./r2-writer.js", () => ({
	R2Writer: class {
		writePatch = mocks.writePatch;
		writeVerifierOutput = vi.fn();
	},
}));

import { BridgeRunDispatcher, isRunDispatchControlMessage } from "./run-dispatcher";
import type { CloudEventSink } from "./event-sink";

const dispatchMessage: RunDispatchControlMessage = {
	agentInstallationId: "agent_01",
	agentKind: "codex",
	machineId: "machine_01",
	privacyMode: "metadata-only",
	queueItemId: "queue_01",
	runId: "run_01",
	sessionId: "session_01",
	targetBranch: "main",
	task: "Fix the queue",
	type: "run.dispatch",
	workspaceId: "ws_01",
};

function createSink() {
	return {
		emit: vi.fn(),
		flush: vi.fn().mockResolvedValue(undefined),
		sendBridgeMessage: vi.fn().mockResolvedValue(true),
	} as unknown as CloudEventSink;
}

function createRegistry(start: HarnessSessionHandle["start"] = vi.fn().mockResolvedValue(undefined)) {
	const registry = new AdapterRegistry();
	const session: HarnessSessionHandle = {
		agentKind: "codex",
		approve: vi.fn(),
		cancel: vi.fn(),
		dispose: vi.fn(),
		pause: vi.fn(),
		resume: vi.fn(),
		runId: dispatchMessage.runId,
		sendTerminalInput: vi.fn(),
		sendUserMessage: vi.fn(),
		start,
	};
	const adapter: HarnessAdapter = {
		createSession: vi.fn(async (ctx: HarnessSessionContext) => {
			void ctx;
			return session;
		}),
		displayName: "Codex",
		id: "codex",
		kind: "codex",
		probe: vi.fn(),
	};
	registry.register(adapter);
	return { adapter, registry, session };
}

describe("BridgeRunDispatcher", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.createWorktree.mockResolvedValue({
			baseCommit: "abc123",
			branchName: "agentdeck/run_01",
			path: "/repo/.worktrees/run_01",
			repoPath: "/repo",
			runId: "run_01",
		});
		mocks.generatePatch.mockResolvedValue({
			additions: 1,
			baseCommit: "abc123",
			deletions: 0,
			diff: "diff --git a/a b/a",
			filesChanged: 1,
			id: "patch_01",
			redactionCount: 0,
			riskScore: 1,
			runId: "run_01",
		});
		mocks.runVerifiers.mockResolvedValue([]);
		mocks.writePatch.mockResolvedValue({ artifactId: "patch_01", objectKey: "patch.diff", redactionStatus: "none", uploaded: true });
	});

	it("starts the selected adapter in an isolated worktree", async () => {
		const sink = createSink();
		const { adapter, registry, session } = createRegistry();
		const dispatcher = new BridgeRunDispatcher({
			adapterRegistry: registry,
			config: {
				cloudUrl: "https://agentdeck.example",
				displayName: "Machine",
				machineId: "machine_01",
				pairedAt: "2026-06-29T00:00:00.000Z",
				privacyMode: "metadata-only",
				token: "token",
				workspaceId: "ws_01",
			},
			repoPath: "/repo",
			sink,
		});

		await expect(dispatcher.dispatch(dispatchMessage)).resolves.toBe(true);

		expect(mocks.createWorktree).toHaveBeenCalledWith("/repo", "run_01", "agentdeck/run_01", {
			targetRef: "main",
		});
		expect(adapter.createSession).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_01", worktreePath: "/repo/.worktrees/run_01" }));
		expect(session.start).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Fix the queue" }), expect.any(Object));
		expect(sink.emit).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_01", type: "run.started" }));
	});

	it("reports already-active runs and forwards runtime controls", async () => {
		const sink = createSink();
		const { registry, session } = createRegistry();
		const dispatcher = new BridgeRunDispatcher({
			adapterRegistry: registry,
			config: {
				cloudUrl: "https://agentdeck.example",
				displayName: "Machine",
				machineId: "machine_01",
				pairedAt: "2026-06-29T00:00:00.000Z",
				privacyMode: "metadata-only",
				token: "token",
				workspaceId: "ws_01",
			},
			repoPath: "/repo",
			sink,
		});

		await dispatcher.dispatch(dispatchMessage);
		await expect(dispatcher.dispatch(dispatchMessage)).resolves.toBe(true);
		await expect(dispatcher.pause("run_01")).resolves.toBe(true);
		await expect(dispatcher.resume("run_01")).resolves.toBe(true);
		await expect(dispatcher.sendFollowUp("run_01", "more context", "follow-up")).resolves.toBe(true);
		await expect(dispatcher.sendFollowUp("run_01", "steer", "steer-now")).resolves.toBe(true);
		await expect(dispatcher.cancel("run_01", "stop")).resolves.toBe(true);
		await expect(dispatcher.pause("run_01")).resolves.toBe(false);

		expect(sink.emit).toHaveBeenCalledWith(expect.objectContaining({ type: "run.status" }));
		expect(session.pause).toHaveBeenCalled();
		expect(session.resume).toHaveBeenCalled();
		expect(session.sendUserMessage).toHaveBeenCalledWith(
			expect.objectContaining({ content: "more context", deliveryPolicy: "after-run-completes", kind: "follow-up" }),
		);
		expect(session.sendUserMessage).toHaveBeenCalledWith(
			expect.objectContaining({ content: "steer", deliveryPolicy: "after-current-turn", kind: "steer-now" }),
		);
		expect(session.cancel).toHaveBeenCalledWith("stop");
	});

	it("ignores dispatches for other machines", async () => {
		const sink = createSink();
		const { registry } = createRegistry();
		const dispatcher = new BridgeRunDispatcher({
			adapterRegistry: registry,
			config: {
				cloudUrl: "https://agentdeck.example",
				displayName: "Machine",
				machineId: "other_machine",
				pairedAt: "2026-06-29T00:00:00.000Z",
				privacyMode: "metadata-only",
				token: "token",
				workspaceId: "ws_01",
			},
			repoPath: "/repo",
			sink,
		});

		await expect(dispatcher.dispatch(dispatchMessage)).resolves.toBe(false);
		expect(mocks.createWorktree).not.toHaveBeenCalled();
	});

	it("emits run.failed when worktree setup fails", async () => {
		mocks.createWorktree.mockRejectedValueOnce(new Error("not a git repo"));
		const sink = createSink();
		const { registry } = createRegistry();
		const dispatcher = new BridgeRunDispatcher({
			adapterRegistry: registry,
			config: {
				cloudUrl: "https://agentdeck.example",
				displayName: "Machine",
				machineId: "machine_01",
				pairedAt: "2026-06-29T00:00:00.000Z",
				privacyMode: "metadata-only",
				token: "token",
				workspaceId: "ws_01",
			},
			repoPath: "/repo",
			sink,
		});

		await expect(dispatcher.dispatch(dispatchMessage)).resolves.toBe(true);

		expect(sink.emit).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_01", type: "run.failed" }));
	});

	it("finalizes successful runs with verifiers, patch upload, and run.completed", async () => {
		const sink = createSink();
		const { registry } = createRegistry();
		const dispatcher = new BridgeRunDispatcher({
			adapterRegistry: registry,
			config: {
				cloudUrl: "https://agentdeck.example",
				displayName: "Machine",
				machineId: "machine_01",
				pairedAt: "2026-06-29T00:00:00.000Z",
				privacyMode: "metadata-only",
				token: "token",
				workspaceId: "ws_01",
			},
			repoPath: "/repo",
			sink,
		});

		await dispatcher.finalize(dispatchMessage, await mocks.createWorktree(), 0);

		expect(mocks.runVerifiers).toHaveBeenCalled();
		expect(mocks.writePatch).toHaveBeenCalledWith(expect.objectContaining({ artifactId: "patch_01", runId: "run_01" }));
		expect(sink.emit).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_01", type: "run.completed" }));
	});

	it("marks final status failed when verifiers fail or terminal exit is non-zero", async () => {
		const sink = createSink();
		const { registry } = createRegistry();
		const dispatcher = new BridgeRunDispatcher({
			adapterRegistry: registry,
			config: {
				cloudUrl: "https://agentdeck.example",
				displayName: "Machine",
				machineId: "machine_01",
				pairedAt: "2026-06-29T00:00:00.000Z",
				privacyMode: "metadata-only",
				token: "token",
				workspaceId: "ws_01",
			},
			repoPath: "/repo",
			sink,
		});
		const worktree = await mocks.createWorktree();

		mocks.runVerifiers.mockResolvedValueOnce([
			{
				command: "pnpm test",
				durationMs: 1,
				id: "verifier-result",
				kind: "test",
				output: "failed",
				status: "failed",
				summary: "Tests failed",
				verifierId: "verifier",
			},
		]);
		await dispatcher.finalize(dispatchMessage, worktree, 0);
		await dispatcher.finalize(dispatchMessage, worktree, 1);

		expect(sink.emit).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_01", type: "run.failed" }));
	});

	it("finalizes when the adapter emits terminal.closed through the lifecycle sink", async () => {
		const start: HarnessSessionHandle["start"] = vi.fn(async (_task, sink) => {
			sink.emit({
				payload: { exitCode: 0 },
				runId: "run_01",
				source: "bridge",
				type: "terminal.closed",
				visibility: "metadata",
			});
		});
		const sink = createSink();
		const { registry } = createRegistry(start);
		const dispatcher = new BridgeRunDispatcher({
			adapterRegistry: registry,
			config: {
				cloudUrl: "https://agentdeck.example",
				displayName: "Machine",
				machineId: "machine_01",
				pairedAt: "2026-06-29T00:00:00.000Z",
				privacyMode: "metadata-only",
				token: "token",
				workspaceId: "ws_01",
			},
			repoPath: "/repo",
			sink,
		});

		await dispatcher.dispatch(dispatchMessage);
		await vi.waitFor(() => {
			expect(sink.emit).toHaveBeenCalledWith(expect.objectContaining({ runId: "run_01", type: "run.completed" }));
		});
	});

	it("validates run dispatch control messages", () => {
		expect(isRunDispatchControlMessage(dispatchMessage)).toBe(true);
		expect(isRunDispatchControlMessage({ ...dispatchMessage, agentKind: "unknown" })).toBe(false);
		expect(isRunDispatchControlMessage({ ...dispatchMessage, model: 1 })).toBe(false);
		expect(isRunDispatchControlMessage({ ...dispatchMessage, provider: 1 })).toBe(false);
		expect(isRunDispatchControlMessage({ ...dispatchMessage, scheduledJobId: 1 })).toBe(false);
	});
});
