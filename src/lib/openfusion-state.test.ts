import { describe, expect, it } from "vitest";

import type { ApprovalStatus, RunStatus, TerminalLeaseMode } from "@/types/openfusion";
import {
	activeRunStatuses,
	canDecideApproval,
	canTransitionRunStatus,
	canTransitionTerminalLease,
	deriveRunProgress,
	isActiveRunStatus,
	isTerminalRunStatus,
	terminalRunStatuses,
	transitionApprovalStatus,
	transitionRunStatus,
	transitionTerminalLease,
} from "@/lib/openfusion-state";

const runStatuses: RunStatus[] = [
	"draft",
	"queued",
	"waiting-machine",
	"running",
	"waiting-approval",
	"paused",
	"verifying",
	"completed",
	"failed",
	"cancelled",
];

const legalRunTransitions: Record<RunStatus, RunStatus[]> = {
	cancelled: [],
	completed: [],
	draft: ["queued", "running", "cancelled"],
	failed: [],
	paused: ["running", "cancelled"],
	queued: ["waiting-machine", "running", "cancelled"],
	running: ["waiting-approval", "paused", "verifying", "completed", "failed", "cancelled"],
	verifying: ["running", "completed", "failed", "cancelled"],
	"waiting-approval": ["running", "paused", "failed", "cancelled"],
	"waiting-machine": ["running", "cancelled"],
};

const approvalStatuses: ApprovalStatus[] = ["pending", "approved", "rejected", "expired"];

const legalApprovalTransitions: Record<ApprovalStatus, ApprovalStatus[]> = {
	approved: [],
	expired: [],
	pending: ["approved", "rejected", "expired"],
	rejected: [],
};

const terminalLeaseModes: TerminalLeaseMode[] = ["agent-control", "human-control", "read-only"];

const legalLeaseTransitions: Record<TerminalLeaseMode, TerminalLeaseMode[]> = {
	"agent-control": ["human-control", "read-only"],
	"human-control": ["agent-control", "read-only"],
	"read-only": ["agent-control", "human-control"],
};

describe("run state machine", () => {
	it("allows every declared legal run transition", () => {
		for (const [from, targets] of Object.entries(legalRunTransitions) as [RunStatus, RunStatus[]][]) {
			for (const to of targets) {
				expect(canTransitionRunStatus(from, to)).toBe(true);
				expect(transitionRunStatus(from, to)).toEqual({ from, ok: true, to });
			}
		}
	});

	it("rejects every undeclared run transition except no-op transitions", () => {
		for (const from of runStatuses) {
			for (const to of runStatuses) {
				if (from === to || legalRunTransitions[from].includes(to)) {
					continue;
				}

				const result = transitionRunStatus(from, to);
				expect(canTransitionRunStatus(from, to)).toBe(false);
				expect(result.ok).toBe(false);
				if (!result.ok) {
					expect(result.reason).toContain(`from ${from} to ${to}`);
				}
			}
		}
	});

	it("treats same-state run transitions as successful no-ops", () => {
		for (const status of runStatuses) {
			expect(transitionRunStatus(status, status)).toEqual({ from: status, ok: true, to: status });
		}
	});

	it("classifies active and terminal run statuses", () => {
		expect([...terminalRunStatuses].sort()).toEqual(["cancelled", "completed", "failed"]);
		expect([...activeRunStatuses].sort()).toEqual([
			"paused",
			"queued",
			"running",
			"verifying",
			"waiting-approval",
			"waiting-machine",
		]);

		for (const status of runStatuses) {
			expect(isTerminalRunStatus(status)).toBe(terminalRunStatuses.has(status));
			expect(isActiveRunStatus(status)).toBe(activeRunStatuses.has(status));
		}
	});

	it("derives bounded progress for every status", () => {
		const progressByStatus = new Map(runStatuses.map((status) => [status, deriveRunProgress(status)]));

		expect(progressByStatus.get("draft")).toBe(0);
		expect(progressByStatus.get("completed")).toBe(100);
		expect(progressByStatus.get("failed")).toBe(100);
		expect(progressByStatus.get("cancelled")).toBe(100);

		for (const progress of progressByStatus.values()) {
			expect(progress).toBeGreaterThanOrEqual(0);
			expect(progress).toBeLessThanOrEqual(100);
		}
	});
});

describe("approval state machine", () => {
	it("allows every declared legal approval transition", () => {
		for (const [from, targets] of Object.entries(legalApprovalTransitions) as [ApprovalStatus, ApprovalStatus[]][]) {
			for (const to of targets) {
				expect(canDecideApproval(from, to)).toBe(true);
				expect(transitionApprovalStatus(from, to)).toEqual({ from, ok: true, to });
			}
		}
	});

	it("rejects every undeclared approval transition except no-op transitions", () => {
		for (const from of approvalStatuses) {
			for (const to of approvalStatuses) {
				if (from === to || legalApprovalTransitions[from].includes(to)) {
					continue;
				}

				const result = transitionApprovalStatus(from, to);
				expect(canDecideApproval(from, to)).toBe(false);
				expect(result.ok).toBe(false);
			}
		}
	});
});

describe("terminal lease state machine", () => {
	it("allows every declared legal lease transition", () => {
		for (const [from, targets] of Object.entries(legalLeaseTransitions) as [TerminalLeaseMode, TerminalLeaseMode[]][]) {
			for (const to of targets) {
				expect(canTransitionTerminalLease(from, to)).toBe(true);
				expect(transitionTerminalLease(from, to)).toEqual({ from, ok: true, to });
			}
		}
	});

	it("keeps same-mode lease transitions as successful no-ops", () => {
		for (const mode of terminalLeaseModes) {
			expect(transitionTerminalLease(mode, mode)).toEqual({ from: mode, ok: true, to: mode });
		}
	});

	it("rejects unknown lease targets at runtime", () => {
		const result = transitionTerminalLease("agent-control", "invalid-mode" as TerminalLeaseMode);

		expect(result.ok).toBe(false);
	});
});
