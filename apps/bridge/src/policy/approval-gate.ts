import { randomUUID } from "node:crypto";
import { classifyCommandRisk, type PolicyDecision } from "@agentdeck/policy";

import type { EventSink } from "../stream/event-sink.js";
import type { BridgeEventDraft, JsonValue } from "../types.js";

export type ApprovalDecision = {
	approvalId: string;
	decidedBy?: string;
	notes?: string;
	status: "approved" | "rejected";
};

export type ApprovalGateOptions = {
	abortSignal?: AbortSignal;
	timeoutMs?: number;
};

export type CommandApprovalEvaluation = {
	allowed: boolean;
	approvalId?: string;
	decision: PolicyDecision;
	status: "allowed" | "approved" | "denied" | "expired" | "rejected";
};

export type EvaluateCommandOptions = ApprovalGateOptions & {
	approvalId?: string;
	command: string;
	runId: string;
	sink: Pick<EventSink, "emit">;
};

type PendingApproval = {
	reject: (error: Error) => void;
	resolve: (decision: ApprovalDecision) => void;
	timer?: ReturnType<typeof setTimeout>;
};

const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

export class ApprovalGate {
	private readonly pending = new Map<string, PendingApproval>();

	async evaluateCommand(options: EvaluateCommandOptions): Promise<CommandApprovalEvaluation> {
		const policyDecision = classifyCommandRisk(options.command);

		if (policyDecision.decision === "allow") {
			return {
				allowed: true,
				decision: policyDecision,
				status: "allowed",
			};
		}

		const approvalId = options.approvalId ?? randomUUID();

		if (policyDecision.decision === "deny") {
			options.sink.emit(
				approvalRejectedEvent({
					approvalId,
					reason: policyDecision.reason,
					runId: options.runId,
				}),
			);
			return {
				allowed: false,
				approvalId,
				decision: policyDecision,
				status: "denied",
			};
		}

		const timeoutMs = options.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
		options.sink.emit(
			approvalRequestedEvent({
				approvalId,
				command: options.command,
				expiresAt: new Date(Date.now() + timeoutMs).toISOString(),
				policyDecision,
				runId: options.runId,
			}),
		);
		options.sink.emit({
			payload: { approvalId },
			runId: options.runId,
			source: "bridge",
			type: "run.waiting_approval",
			visibility: "metadata",
		});

		try {
			const decision = await this.waitForDecision(approvalId, {
				abortSignal: options.abortSignal,
				timeoutMs,
			});
			return {
				allowed: decision.status === "approved",
				approvalId,
				decision: policyDecision,
				status: decision.status === "approved" ? "approved" : "rejected",
			};
		} catch (error) {
			if (error instanceof Error && error.message.includes("timed out")) {
				options.sink.emit({
					payload: { approvalId },
					runId: options.runId,
					source: "bridge",
					type: "approval.expired",
					visibility: "metadata",
				});
				return {
					allowed: false,
					approvalId,
					decision: policyDecision,
					status: "expired",
				};
			}
			throw error;
		}
	}

	waitForDecision(approvalId: string, options: ApprovalGateOptions = {}): Promise<ApprovalDecision> {
		if (this.pending.has(approvalId)) {
			throw new Error(`Approval ${approvalId} is already pending.`);
		}

		return new Promise((resolve, reject) => {
			const pending: PendingApproval = { reject, resolve };
			if (options.timeoutMs && options.timeoutMs > 0) {
				pending.timer = setTimeout(() => {
					this.pending.delete(approvalId);
					reject(new Error(`Approval ${approvalId} timed out.`));
				}, options.timeoutMs);
			}

			const abort = () => {
				this.pending.delete(approvalId);
				if (pending.timer) {
					clearTimeout(pending.timer);
				}
				reject(new Error(`Approval ${approvalId} was aborted.`));
			};

			if (options.abortSignal?.aborted) {
				abort();
				return;
			}

			options.abortSignal?.addEventListener("abort", abort, { once: true });
			this.pending.set(approvalId, pending);
		});
	}

	resolve(decision: ApprovalDecision): boolean {
		const pending = this.pending.get(decision.approvalId);
		if (!pending) {
			return false;
		}

		this.pending.delete(decision.approvalId);
		if (pending.timer) {
			clearTimeout(pending.timer);
		}
		pending.resolve(decision);
		return true;
	}

	reject(approvalId: string, error: Error): boolean {
		const pending = this.pending.get(approvalId);
		if (!pending) {
			return false;
		}

		this.pending.delete(approvalId);
		if (pending.timer) {
			clearTimeout(pending.timer);
		}
		pending.reject(error);
		return true;
	}

	get size(): number {
		return this.pending.size;
	}
}

function approvalRequestedEvent(input: {
	approvalId: string;
	command: string;
	expiresAt: string;
	policyDecision: PolicyDecision;
	runId: string;
}): BridgeEventDraft<"approval.requested"> {
	return {
		payload: {
			approvalId: input.approvalId,
			expiresAt: input.expiresAt,
			kind: "command",
			requestedAction: {
				command: input.command,
				reason: input.policyDecision.reason,
				risk: input.policyDecision.risk,
			} satisfies JsonValue,
			risk: input.policyDecision.risk,
			title: `Approve command: ${input.command}`,
		},
		runId: input.runId,
		source: "bridge",
		type: "approval.requested",
		visibility: "metadata",
	};
}

function approvalRejectedEvent(input: {
	approvalId: string;
	reason: string;
	runId: string;
}): BridgeEventDraft<"approval.rejected"> {
	return {
		payload: {
			approvalId: input.approvalId,
			decidedBy: "policy",
			reason: input.reason,
		},
		runId: input.runId,
		source: "bridge",
		type: "approval.rejected",
		visibility: "metadata",
	};
}
