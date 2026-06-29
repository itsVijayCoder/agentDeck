export type CircuitState = "closed" | "half-open" | "open";

export type CircuitBreakerSnapshot = {
	failureCount: number;
	lastFailureAt?: number;
	state: CircuitState;
};

export type CircuitBreakerOptions = {
	failureThreshold?: number;
	now?: () => number;
	resetTimeoutMs?: number;
};

export class CircuitBreaker {
	private failureCount = 0;
	private lastFailureAt: number | undefined;
	private state: CircuitState = "closed";
	private readonly failureThreshold: number;
	private readonly now: () => number;
	private readonly resetTimeoutMs: number;

	constructor(options: CircuitBreakerOptions = {}) {
		this.failureThreshold = options.failureThreshold ?? 5;
		this.resetTimeoutMs = options.resetTimeoutMs ?? 60_000;
		this.now = options.now ?? Date.now;
	}

	canExecute(): boolean {
		if (this.state !== "open") {
			return true;
		}

		if (this.lastFailureAt === undefined || this.now() - this.lastFailureAt < this.resetTimeoutMs) {
			return false;
		}

		this.state = "half-open";
		return true;
	}

	recordFailure(): void {
		this.failureCount += 1;
		this.lastFailureAt = this.now();
		if (this.failureCount >= this.failureThreshold) {
			this.state = "open";
		}
	}

	recordSuccess(): void {
		this.failureCount = 0;
		this.lastFailureAt = undefined;
		this.state = "closed";
	}

	snapshot(): CircuitBreakerSnapshot {
		return {
			failureCount: this.failureCount,
			...(this.lastFailureAt === undefined ? {} : { lastFailureAt: this.lastFailureAt }),
			state: this.state,
		};
	}
}
