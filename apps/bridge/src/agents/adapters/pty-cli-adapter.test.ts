import { describe, expect, it } from "vitest";

import type { PtyExit, PtyManager, PtySession, PtySpawnOptions } from "../../pty/pty-manager.js";
import { TerminalSessionRegistry } from "../../pty/terminal-control.js";
import type { BridgeEventDraft } from "../../types.js";
import { PtyCliAgentAdapter } from "./pty-cli-adapter.js";

class FakePty implements PtySession {
	dataHandler: ((data: string) => void) | null = null;
	exitHandler: ((exit: PtyExit) => void) | null = null;
	killedWith: string | undefined;
	pid = 99;
	writes: string[] = [];

	kill(signal?: string): void {
		this.killedWith = signal;
	}

	onData(handler: (data: string) => void): void {
		this.dataHandler = handler;
	}

	onExit(handler: (exit: PtyExit) => void): void {
		this.exitHandler = handler;
	}

	resize(): void {}

	write(data: string): void {
		this.writes.push(data);
	}
}

describe("PtyCliAgentAdapter", () => {
	it("probes via injected command probe options", async () => {
		const adapter = new PtyCliAgentAdapter(
			{
				authPaths: ["/auth.json"],
				buildArgs: (task) => [task.prompt],
				capabilities: ["terminal"],
				command: "agent",
				displayName: "Agent",
				harnessMode: "pty",
				id: "codex",
				kind: "codex",
				versionArgs: ["--version"],
			},
			{ spawn: () => new FakePty() } as unknown as PtyManager,
			undefined,
			{
				authChecker: async () => "missing",
				versionProbe: async () => ({ found: true, stdout: "agent 1" }),
			},
		);

		await expect(adapter.probe()).resolves.toMatchObject({
			authStatus: "missing",
			command: "agent",
			found: true,
			version: "agent 1",
		});
	});

	it("starts a terminal session, registers it, and delivers steering", async () => {
		const events: BridgeEventDraft[] = [];
		const fakePty = new FakePty();
		const spawned: Array<{ args: string[]; command: string; options: PtySpawnOptions }> = [];
		const manager = {
			spawn: (command: string, args: string[], options: PtySpawnOptions) => {
				spawned.push({ args, command, options });
				return fakePty;
			},
		} as unknown as PtyManager;
		const registry = new TerminalSessionRegistry();
		const adapter = new PtyCliAgentAdapter(
			{
				authPaths: [],
				buildArgs: (task) => ["run", task.prompt],
				capabilities: ["terminal"],
				command: "agent",
				displayName: "Agent",
				env: () => ({ AGENT_ENV: "test" }),
				harnessMode: "pty",
				id: "codex",
				kind: "codex",
				versionArgs: ["--version"],
			},
			manager,
			registry,
		);
		const session = await adapter.createSession({
			cwd: "/repo",
			privacyMode: "metadata-only",
			runId: "run-1",
			sessionId: "session-1",
			workspaceId: "workspace-1",
		});

		await session.start({ model: "model-1", prompt: "fix it" }, {
			emit: (event) => events.push(event),
			flush: async () => undefined,
		});
		await session.sendUserMessage({
			content: "continue",
			deliveryPolicy: "after-current-turn",
			kind: "follow-up",
		});
		await session.cancel("user request");

		expect(spawned).toEqual([
			expect.objectContaining({
				args: ["run", "fix it"],
				command: "agent",
				options: expect.objectContaining({
					cwd: "/repo",
					env: expect.objectContaining({
						AGENTDECK_MODEL: "model-1",
						AGENTDECK_RUN_ID: "run-1",
						AGENT_ENV: "test",
					}),
				}),
			}),
		]);
		expect(registry.get("run-1")).toBeDefined();
		expect(fakePty.writes).toEqual(["continue\n", "\n# AgentDeck cancelled this run: user request\n"]);
		expect(fakePty.killedWith).toBe("SIGTERM");
		expect(events.map((event) => event.type)).toEqual([
			"agent.started",
			"terminal.open",
			"message.queued",
			"message.delivered",
			"agent.ended",
		]);
	});

	it("handles approval, pause, resume, duplicate start, and dispose paths", async () => {
		const fakePty = new FakePty();
		const manager = { spawn: () => fakePty } as unknown as PtyManager;
		const registry = new TerminalSessionRegistry();
		const adapter = new PtyCliAgentAdapter(
			{
				authPaths: [],
				buildArgs: () => [],
				capabilities: ["terminal"],
				command: "agent",
				displayName: "Agent",
				harnessMode: "pty",
				id: "codex",
				kind: "codex",
				versionArgs: ["--version"],
			},
			manager,
			registry,
		);
		const session = await adapter.createSession({
			cwd: "/repo",
			privacyMode: "metadata-only",
			runId: "run-2",
			sessionId: "session-1",
			workspaceId: "workspace-1",
		});

		await session.start({ prompt: "task" }, {
			emit: () => undefined,
			flush: async () => undefined,
		});

		await expect(
			session.start({ prompt: "again" }, {
				emit: () => undefined,
				flush: async () => undefined,
			}),
		).rejects.toThrow("already started");
		await session.approve("approval-1", { status: "approved" });
		await session.approve("approval-1", { status: "rejected" });
		await session.pause();
		await session.resume();
		await session.dispose();

		expect(fakePty.writes).toEqual(["y\n", "n\n"]);
		expect(fakePty.killedWith).toBeUndefined();
		expect(registry.get("run-2")).toBeUndefined();
	});
});
