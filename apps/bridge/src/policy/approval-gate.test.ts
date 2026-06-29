import { describe, expect, it, vi } from "vitest";

import { ApprovalGate } from "./approval-gate.js";

describe("ApprovalGate", () => {
	it("resolves pending approvals by id", async () => {
		const gate = new ApprovalGate();
		const pending = gate.waitForDecision("approval-1");

		expect(gate.resolve({ approvalId: "approval-1", status: "approved" })).toBe(true);

		await expect(pending).resolves.toMatchObject({ approvalId: "approval-1", status: "approved" });
		expect(gate.size).toBe(0);
	});

	it("returns false for unknown decisions", () => {
		expect(new ApprovalGate().resolve({ approvalId: "missing", status: "rejected" })).toBe(false);
	});

	it("rejects pending approvals explicitly", async () => {
		const gate = new ApprovalGate();
		const pending = gate.waitForDecision("approval-1");

		expect(gate.reject("approval-1", new Error("no"))).toBe(true);

		await expect(pending).rejects.toThrow("no");
	});

	it("prevents duplicate pending approvals", () => {
		const gate = new ApprovalGate();
		void gate.waitForDecision("approval-1");

		expect(() => gate.waitForDecision("approval-1")).toThrow("already pending");
	});

	it("aborts pending approvals", async () => {
		const gate = new ApprovalGate();
		const controller = new AbortController();
		const pending = gate.waitForDecision("approval-1", { abortSignal: controller.signal });

		controller.abort();

		await expect(pending).rejects.toThrow("aborted");
	});

	it("handles already-aborted signals", async () => {
		const gate = new ApprovalGate();
		const controller = new AbortController();
		controller.abort();

		await expect(gate.waitForDecision("approval-1", { abortSignal: controller.signal })).rejects.toThrow("aborted");
	});

	it("times out pending approvals", async () => {
		vi.useFakeTimers();
		try {
			const gate = new ApprovalGate();
			const pending = gate.waitForDecision("approval-1", { timeoutMs: 100 });
			const assertion = expect(pending).rejects.toThrow("timed out");

			await vi.advanceTimersByTimeAsync(100);

			await assertion;
		} finally {
			vi.useRealTimers();
		}
	});

	it("clears timeout handles when resolving or rejecting", async () => {
		const gate = new ApprovalGate();
		const resolved = gate.waitForDecision("approval-1", { timeoutMs: 1_000 });
		expect(gate.resolve({ approvalId: "approval-1", status: "approved" })).toBe(true);
		await expect(resolved).resolves.toMatchObject({ status: "approved" });

		const rejected = gate.waitForDecision("approval-2", { timeoutMs: 1_000 });
		expect(gate.reject("approval-2", new Error("rejected"))).toBe(true);
		await expect(rejected).rejects.toThrow("rejected");
	});
});
