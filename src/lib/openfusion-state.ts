import type { ApprovalStatus, RunStatus, TerminalLeaseMode } from "@/types/openfusion";

export type StateTransitionResult<TState extends string> =
	| { ok: true; from: TState; to: TState }
	| { ok: false; from: TState; to: TState; reason: string };

export const terminalRunStatuses = new Set<RunStatus>(["completed", "failed", "cancelled"]);

export const activeRunStatuses = new Set<RunStatus>(["queued", "waiting-machine", "running", "waiting-approval", "paused", "verifying"]);

const runTransitions: Record<RunStatus, readonly RunStatus[]> = {
	draft: ["queued", "running", "cancelled"],
	queued: ["waiting-machine", "running", "cancelled"],
	"waiting-machine": ["running", "cancelled"],
	running: ["waiting-approval", "paused", "verifying", "completed", "failed", "cancelled"],
	"waiting-approval": ["running", "paused", "failed", "cancelled"],
	paused: ["running", "cancelled"],
	verifying: ["running", "completed", "failed", "cancelled"],
	completed: [],
	failed: [],
	cancelled: [],
};

const approvalTransitions: Record<ApprovalStatus, readonly ApprovalStatus[]> = {
	pending: ["approved", "rejected", "expired"],
	approved: [],
	rejected: [],
	expired: [],
};

const leaseTransitions: Record<TerminalLeaseMode, readonly TerminalLeaseMode[]> = {
	"agent-control": ["human-control", "read-only"],
	"human-control": ["agent-control", "read-only"],
	"read-only": ["agent-control", "human-control"],
};

export function canTransitionRunStatus(from: RunStatus, to: RunStatus): boolean {
	return runTransitions[from].includes(to);
}

export function transitionRunStatus(from: RunStatus, to: RunStatus): StateTransitionResult<RunStatus> {
	if (from === to) return { ok: true, from, to };
	if (canTransitionRunStatus(from, to)) return { ok: true, from, to };

	return {
		ok: false,
		from,
		to,
		reason: `Run status cannot transition from ${from} to ${to}.`,
	};
}

export function canDecideApproval(from: ApprovalStatus, to: ApprovalStatus): boolean {
	return approvalTransitions[from].includes(to);
}

export function transitionApprovalStatus(from: ApprovalStatus, to: ApprovalStatus): StateTransitionResult<ApprovalStatus> {
	if (from === to) return { ok: true, from, to };
	if (canDecideApproval(from, to)) return { ok: true, from, to };

	return {
		ok: false,
		from,
		to,
		reason: `Approval status cannot transition from ${from} to ${to}.`,
	};
}

export function canTransitionTerminalLease(from: TerminalLeaseMode, to: TerminalLeaseMode): boolean {
	return leaseTransitions[from].includes(to);
}

export function transitionTerminalLease(
	from: TerminalLeaseMode,
	to: TerminalLeaseMode,
): StateTransitionResult<TerminalLeaseMode> {
	if (from === to) return { ok: true, from, to };
	if (canTransitionTerminalLease(from, to)) return { ok: true, from, to };

	return {
		ok: false,
		from,
		to,
		reason: `Terminal lease cannot transition from ${from} to ${to}.`,
	};
}

export function isTerminalRunStatus(status: RunStatus): boolean {
	return terminalRunStatuses.has(status);
}

export function isActiveRunStatus(status: RunStatus): boolean {
	return activeRunStatuses.has(status);
}

export function deriveRunProgress(status: RunStatus): number {
	switch (status) {
		case "draft":
			return 0;
		case "queued":
			return 8;
		case "waiting-machine":
			return 12;
		case "running":
			return 52;
		case "waiting-approval":
			return 58;
		case "paused":
			return 60;
		case "verifying":
			return 82;
		case "completed":
			return 100;
		case "failed":
		case "cancelled":
			return 100;
	}
}
