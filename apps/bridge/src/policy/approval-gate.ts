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

type PendingApproval = {
	reject: (error: Error) => void;
	resolve: (decision: ApprovalDecision) => void;
	timer?: ReturnType<typeof setTimeout>;
};

export class ApprovalGate {
	private readonly pending = new Map<string, PendingApproval>();

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
