import { describe, expect, it } from "vitest";

import { CircuitBreaker } from "./circuit-breaker";

describe("CircuitBreaker", () => {
	it("opens after the configured threshold and half-opens after the reset timeout", () => {
		let now = 1_000;
		const breaker = new CircuitBreaker({ failureThreshold: 2, now: () => now, resetTimeoutMs: 500 });

		expect(breaker.canExecute()).toBe(true);
		breaker.recordFailure();
		expect(breaker.snapshot()).toMatchObject({ failureCount: 1, state: "closed" });
		breaker.recordFailure();
		expect(breaker.canExecute()).toBe(false);
		expect(breaker.snapshot()).toMatchObject({ failureCount: 2, lastFailureAt: 1_000, state: "open" });

		now = 1_400;
		expect(breaker.canExecute()).toBe(false);
		now = 1_501;
		expect(breaker.canExecute()).toBe(true);
		expect(breaker.snapshot().state).toBe("half-open");
	});

	it("closes after a successful probe", () => {
		let now = 0;
		const breaker = new CircuitBreaker({ failureThreshold: 1, now: () => now, resetTimeoutMs: 100 });

		breaker.recordFailure();
		now = 101;
		expect(breaker.canExecute()).toBe(true);
		breaker.recordSuccess();

		expect(breaker.snapshot()).toEqual({ failureCount: 0, state: "closed" });
		expect(breaker.canExecute()).toBe(true);
	});
});
