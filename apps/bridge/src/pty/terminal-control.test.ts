import { describe, expect, it } from "vitest";

import {
	TerminalSessionRegistry,
	handleTerminalControlMessage,
	isBrowserControlMessage,
	type TerminalControlSession,
} from "./terminal-control.js";

class FakeTerminalSession implements TerminalControlSession {
	leaseRequests: Array<{ holderUserId: string; mode?: "agent-control" | "human-control" | "read-only" }> = [];
	releases: string[] = [];
	resizes: Array<[number, number]> = [];
	stdin: Array<{ data: string; userId: string }> = [];

	constructor(private readonly runId: string) {}

	getState() {
		return {
			leaseMode: "agent-control" as const,
			runId: this.runId,
			started: true,
		};
	}

	releaseLease(leaseId: string): boolean {
		this.releases.push(leaseId);
		return leaseId === "lease-1";
	}

	requestLease(holderUserId: string, mode?: "agent-control" | "human-control" | "read-only") {
		this.leaseRequests.push({ holderUserId, mode });
		return { leaseId: "lease-1", ok: true };
	}

	resize(cols: number, rows: number): void {
		this.resizes.push([cols, rows]);
	}

	writeStdin(data: string, userId: string): boolean {
		this.stdin.push({ data, userId });
		return userId !== "unknown";
	}
}

describe("terminal control dispatcher", () => {
	it("routes terminal controls to the run session", () => {
		const registry = new TerminalSessionRegistry();
		const session = new FakeTerminalSession("run-1");
		registry.register(session);

		expect(
			handleTerminalControlMessage(
				{ mode: "human-control", runId: "run-1", type: "terminal.lease.request", userId: "user-1" },
				registry,
			),
		).toBe(true);
		expect(handleTerminalControlMessage({ cols: 120, rows: 32, runId: "run-1", type: "terminal.resize" }, registry)).toBe(
			true,
		);
		expect(handleTerminalControlMessage({ data: "a", runId: "run-1", type: "terminal.stdin", userId: "user-1" }, registry)).toBe(
			true,
		);
		expect(handleTerminalControlMessage({ leaseId: "lease-1", runId: "run-1", type: "terminal.lease.release" }, registry)).toBe(
			true,
		);

		expect(session.leaseRequests).toEqual([{ holderUserId: "user-1", mode: "human-control" }]);
		expect(session.resizes).toEqual([[120, 32]]);
		expect(session.stdin).toEqual([{ data: "a", userId: "user-1" }]);
		expect(session.releases).toEqual(["lease-1"]);
	});

	it("rejects missing sessions and unauthenticated stdin", () => {
		const registry = new TerminalSessionRegistry();
		registry.set("run-1", new FakeTerminalSession("run-1"));

		expect(handleTerminalControlMessage({ data: "a", runId: "run-2", type: "terminal.stdin", userId: "user-1" }, registry)).toBe(
			false,
		);
		expect(handleTerminalControlMessage({ data: "a", runId: "run-1", type: "terminal.stdin" }, registry)).toBe(false);
	});

	it("identifies browser control envelopes", () => {
		expect(isBrowserControlMessage({ runId: "run-1", type: "terminal.resize" })).toBe(true);
		expect(isBrowserControlMessage({ type: "connection.established" })).toBe(false);
		expect(isBrowserControlMessage(null)).toBe(false);
	});
});
