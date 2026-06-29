import { describe, expect, it } from "vitest";

import { defaultQueuePolicy, isWithinAllowedHours, queuePolicyFromScheduleWindow, shouldDispatch } from "./queue-policy";

describe("queue policy", () => {
	it("allows dispatch when no allowed-hours window is configured", () => {
		expect(isWithinAllowedHours(defaultQueuePolicy, new Date("2026-06-29T12:00:00.000Z"))).toBe(true);
	});

	it("matches allowed hours in the configured timezone", () => {
		const policy = queuePolicyFromScheduleWindow({
			allowedHours: [{ days: ["Monday"], end: "03:00", start: "01:00", timezone: "Asia/Kolkata" }],
		});

		expect(isWithinAllowedHours(policy, new Date("2026-06-28T20:00:00.000Z"), "UTC")).toBe(true);
		expect(isWithinAllowedHours(policy, new Date("2026-06-28T18:00:00.000Z"), "UTC")).toBe(false);
	});

	it("supports overnight allowed windows", () => {
		const policy = queuePolicyFromScheduleWindow({
			allowedHours: [{ days: ["Monday"], end: "02:00", start: "22:00", timezone: "UTC" }],
		});

		expect(isWithinAllowedHours(policy, new Date("2026-06-29T23:30:00.000Z"), "UTC")).toBe(true);
		expect(isWithinAllowedHours(policy, new Date("2026-06-29T12:30:00.000Z"), "UTC")).toBe(false);
	});

	it("blocks dispatch when machines, concurrency, or windows are unavailable", () => {
		const policy = queuePolicyFromScheduleWindow({
			allowedHours: [{ days: ["Monday"], end: "03:00", start: "01:00", timezone: "UTC" }],
			maxConcurrentRunsPerMachine: 1,
		});

		expect(
			shouldDispatch({
				concurrentRuns: 0,
				machineOnline: false,
				now: new Date("2026-06-29T01:30:00.000Z"),
				policy,
				timezone: "UTC",
			}),
		).toEqual({ dispatch: false, reason: "No machine online" });
		expect(
			shouldDispatch({
				concurrentRuns: 1,
				machineOnline: true,
				now: new Date("2026-06-29T01:30:00.000Z"),
				policy,
				timezone: "UTC",
			}),
		).toEqual({ dispatch: false, reason: "Max concurrent runs reached" });
		expect(
			shouldDispatch({
				concurrentRuns: 0,
				machineOnline: true,
				now: new Date("2026-06-29T04:30:00.000Z"),
				policy,
				timezone: "UTC",
			}),
		).toEqual({ dispatch: false, reason: "Outside allowed hours" });
	});
});
