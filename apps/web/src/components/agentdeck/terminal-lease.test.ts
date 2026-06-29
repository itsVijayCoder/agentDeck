import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@agentdeck/core";

import { deriveTerminalLeaseStates, reduceTerminalLeaseState } from "./terminal-lease";

let nextId = 0;

function event(input: Partial<EventEnvelope> & Pick<EventEnvelope, "type" | "payload">): EventEnvelope {
	return {
		createdAt: "2026-06-29T00:00:00.000Z",
		id: `event-${nextId++}`,
		seq: 1,
		sessionId: "session-1",
		source: "bridge",
		visibility: "metadata",
		workspaceId: "workspace-1",
		...input,
	};
}

describe("terminal lease helpers", () => {
	it("derives the latest lease state per run", () => {
		const states = deriveTerminalLeaseStates([
			event({
				payload: { holderUserId: "user-1", leaseId: "lease-1", mode: "human-control" },
				runId: "run-1",
				type: "terminal.lease_granted",
			}),
			event({
				payload: { holderUserId: "user-2", leaseId: "lease-2", mode: "read-only" },
				runId: "run-2",
				type: "terminal.lease_granted",
			}),
			event({
				payload: { leaseId: "lease-1" },
				runId: "run-1",
				type: "terminal.lease_released",
			}),
		]);

		expect(states).toEqual({
			"run-1": { mode: "agent-control" },
			"run-2": { holderUserId: "user-2", leaseId: "lease-2", mode: "read-only" },
		});
	});

	it("ignores unrelated events", () => {
		const current = { leaseId: "lease-1", mode: "human-control" as const };

		expect(reduceTerminalLeaseState(current, event({ payload: { data: "hello" }, type: "terminal.stdout" }))).toBe(
			current,
		);
	});
});
