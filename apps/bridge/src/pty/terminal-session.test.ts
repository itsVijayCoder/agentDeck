import { describe, expect, it } from "vitest";

import { TerminalSession } from "./terminal-session.js";
import type { PtyExit, PtyManager, PtySession } from "./pty-manager.js";
import type { BridgeEventDraft } from "../types.js";

class FakePty implements PtySession {
	dataHandler: ((data: string) => void) | null = null;
	exitHandler: ((exit: PtyExit) => void) | null = null;
	killedWith: string | undefined;
	pid = 42;
	resized: Array<[number, number]> = [];
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

	resize(cols: number, rows: number): void {
		this.resized.push([cols, rows]);
	}

	write(data: string): void {
		this.writes.push(data);
	}
}

describe("TerminalSession", () => {
	it("emits terminal lifecycle events and gates stdin by lease", () => {
		const events: BridgeEventDraft[] = [];
		const fakePty = new FakePty();
		const manager = {
			spawn: () => fakePty,
		} as unknown as PtyManager;
		const session = new TerminalSession(manager, "run-1", {
			emit: (event) => events.push(event),
			flush: async () => undefined,
		});

		session.start("codex", [], { cols: 100, cwd: "/repo", rows: 30 });
		fakePty.dataHandler?.("hello");
		expect(session.writeStdin("x", "user-1")).toBe(false);

		const lease = session.requestLease("user-1");
		expect(lease.ok).toBe(true);
		expect(session.writeStdin("x", "user-1")).toBe(true);
		expect(session.writeAgentInput("agent message\n")).toBe(true);
		session.resize(120, 40);
		fakePty.exitHandler?.({ exitCode: 0 });
		session.kill("SIGTERM");

		expect(fakePty.writes).toEqual(["x", "agent message\n"]);
		expect(fakePty.resized).toEqual([[120, 40]]);
		expect(fakePty.killedWith).toBe("SIGTERM");
		expect(session.getHumanInputLog()).toEqual([expect.objectContaining({ data: "x", userId: "user-1" })]);
		expect(events.map((event) => event.type)).toEqual([
			"terminal.open",
			"terminal.stdout",
			"terminal.lease_granted",
			"terminal.stdin",
			"terminal.resize",
			"terminal.closed",
		]);
	});

	it("prevents duplicate starts and mismatched lease releases", () => {
		const fakePty = new FakePty();
		const manager = { spawn: () => fakePty } as unknown as PtyManager;
		const session = new TerminalSession(manager, "run-1", {
			emit: () => undefined,
			flush: async () => undefined,
		});

		session.start("codex", [], { cwd: "/repo" });

		expect(() => session.start("codex", [], { cwd: "/repo" })).toThrow("already started");
		expect(session.releaseLease("wrong")).toBe(false);
		expect(session.getState()).toMatchObject({ leaseMode: "agent-control", pid: 42, started: true });
	});

	it("releases matching leases back to agent control", () => {
		const manager = { spawn: () => new FakePty() } as unknown as PtyManager;
		const session = new TerminalSession(manager, "run-1", {
			emit: () => undefined,
			flush: async () => undefined,
		});

		const lease = session.requestLease("user-1");

		expect(lease.leaseId).toBeDefined();
		expect(session.releaseLease(lease.leaseId ?? "")).toBe(true);
		expect(session.getState()).toMatchObject({ leaseMode: "agent-control", started: false });
	});
});
