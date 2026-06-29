import { describe, expect, it } from "vitest";

import { calculateNextRun, parseNaturalLanguageSchedule, shouldGenerateMorningReport } from "./schedule-parser";

describe("schedule parser", () => {
	it("parses common natural-language schedule patterns", () => {
		expect(parseNaturalLanguageSchedule("every weekday at 1 AM IST")).toEqual({
			cron: "0 1 * * 1-5",
			timezone: "Asia/Kolkata",
		});
		expect(parseNaturalLanguageSchedule("every Monday at 9:30 AM UTC")).toEqual({
			cron: "30 9 * * 1",
			timezone: "UTC",
		});
		expect(parseNaturalLanguageSchedule("every day at 8:15 PM PST")).toEqual({
			cron: "15 20 * * *",
			timezone: "America/Los_Angeles",
		});
		expect(parseNaturalLanguageSchedule("not a schedule")).toBeNull();
	});

	it("calculates the next UTC run from a timezone cron", () => {
		const from = new Date("2026-06-28T18:00:00.000Z");

		expect(calculateNextRun("0 1 * * 1-5", "Asia/Kolkata", from)).toBe("2026-06-28T19:30:00.000Z");
	});

	it("handles weekday ranges and daily schedules", () => {
		expect(calculateNextRun("30 8 * * 1-5", "UTC", new Date("2026-06-27T12:00:00.000Z"))).toBe(
			"2026-06-29T08:30:00.000Z",
		);
		expect(calculateNextRun("0 * * * *", "UTC", new Date("2026-06-29T08:30:30.000Z"))).toBe(
			"2026-06-29T09:00:00.000Z",
		);
	});

	it("detects the morning report cron minute", () => {
		expect(shouldGenerateMorningReport(new Date("2026-06-29T08:00:00.000Z"), "UTC")).toBe(true);
		expect(shouldGenerateMorningReport(new Date("2026-06-29T08:01:00.000Z"), "UTC")).toBe(false);
	});
});
