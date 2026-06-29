export type ParsedSchedule = {
	cron: string;
	timezone: string;
};

type CronMatcher = {
	dayOfMonth: FieldMatcher;
	dayOfWeek: FieldMatcher;
	hour: FieldMatcher;
	minute: FieldMatcher;
	month: FieldMatcher;
};

type FieldMatcher = {
	any: boolean;
	values: Set<number>;
};

const dayNames = {
	friday: 5,
	monday: 1,
	saturday: 6,
	sunday: 0,
	thursday: 4,
	tuesday: 2,
	wednesday: 3,
} as const;

const timezoneAliases: Record<string, string> = {
	est: "America/New_York",
	edt: "America/New_York",
	ist: "Asia/Kolkata",
	pst: "America/Los_Angeles",
	pdt: "America/Los_Angeles",
	utc: "UTC",
};

export function parseNaturalLanguageSchedule(input: string, fallbackTimezone = "UTC"): ParsedSchedule | null {
	const lower = input.trim().toLowerCase();

	const weekdayMatch = /^every weekday at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s+([a-z_/+-]+))?$/u.exec(lower);
	if (weekdayMatch) {
		const hour = normalizeHour(Number(weekdayMatch[1]), weekdayMatch[3]);
		const minute = Number(weekdayMatch[2] ?? 0);
		if (!isValidHour(hour) || !isValidMinute(minute)) {
			return null;
		}
		return {
			cron: `${minute} ${hour} * * 1-5`,
			timezone: normalizeTimezone(weekdayMatch[4], fallbackTimezone),
		};
	}

	const dayMatch = /^every (monday|tuesday|wednesday|thursday|friday|saturday|sunday) at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s+([a-z_/+-]+))?$/u.exec(
		lower,
	);
	if (dayMatch) {
		const hour = normalizeHour(Number(dayMatch[2]), dayMatch[4]);
		const minute = Number(dayMatch[3] ?? 0);
		if (!isValidHour(hour) || !isValidMinute(minute)) {
			return null;
		}
		return {
			cron: `${minute} ${hour} * * ${dayNames[dayMatch[1] as keyof typeof dayNames]}`,
			timezone: normalizeTimezone(dayMatch[5], fallbackTimezone),
		};
	}

	const dailyMatch = /^every day at (\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s+([a-z_/+-]+))?$/u.exec(lower);
	if (dailyMatch) {
		const hour = normalizeHour(Number(dailyMatch[1]), dailyMatch[3]);
		const minute = Number(dailyMatch[2] ?? 0);
		if (!isValidHour(hour) || !isValidMinute(minute)) {
			return null;
		}
		return {
			cron: `${minute} ${hour} * * *`,
			timezone: normalizeTimezone(dailyMatch[4], fallbackTimezone),
		};
	}

	const hourlyMatch = /^every hour(?: at minute (\d{1,2}))?(?:\s+([a-z_/+-]+))?$/u.exec(lower);
	if (hourlyMatch) {
		const minute = Number(hourlyMatch[1] ?? 0);
		if (!isValidMinute(minute)) {
			return null;
		}
		return {
			cron: `${minute} * * * *`,
			timezone: normalizeTimezone(hourlyMatch[2], fallbackTimezone),
		};
	}

	return null;
}

export function calculateNextRun(cron: string, timezone: string, from = new Date()): string {
	const matcher = parseCron(cron);
	const startMs = Math.floor(from.getTime() / 60_000) * 60_000 + 60_000;
	const maxMinutes = 366 * 24 * 60;

	for (let offset = 0; offset < maxMinutes; offset += 1) {
		const candidate = new Date(startMs + offset * 60_000);
		if (matchesCron(candidate, timezone, matcher)) {
			return candidate.toISOString();
		}
	}

	throw new Error(`Unable to calculate next run for cron expression: ${cron}`);
}

export function shouldGenerateMorningReport(now: Date, timezone = "UTC"): boolean {
	const parts = getZonedParts(now, timezone);
	return parts.hour === 8 && parts.minute === 0;
}

function parseCron(cron: string): CronMatcher {
	const fields = cron.trim().split(/\s+/u);
	if (fields.length !== 5) {
		throw new Error("Expected a five-field cron expression.");
	}

	return {
		dayOfMonth: parseCronField(fields[2], 1, 31),
		dayOfWeek: parseCronField(fields[4], 0, 7),
		hour: parseCronField(fields[1], 0, 23),
		minute: parseCronField(fields[0], 0, 59),
		month: parseCronField(fields[3], 1, 12),
	};
}

function matchesCron(date: Date, timezone: string, matcher: CronMatcher): boolean {
	const parts = getZonedParts(date, timezone);
	const dayOfWeek = parts.dayOfWeek === 7 ? 0 : parts.dayOfWeek;
	const dayOfMonthMatches = matcher.dayOfMonth.values.has(parts.day);
	const dayOfWeekMatches = matcher.dayOfWeek.values.has(dayOfWeek) || (dayOfWeek === 0 && matcher.dayOfWeek.values.has(7));
	const dayMatches =
		matcher.dayOfMonth.any && matcher.dayOfWeek.any
			? true
			: matcher.dayOfMonth.any
				? dayOfWeekMatches
				: matcher.dayOfWeek.any
					? dayOfMonthMatches
					: dayOfMonthMatches || dayOfWeekMatches;

	return (
		matcher.minute.values.has(parts.minute) &&
		matcher.hour.values.has(parts.hour) &&
		matcher.month.values.has(parts.month) &&
		dayMatches
	);
}

function parseCronField(field: string, min: number, max: number): FieldMatcher {
	const values = new Set<number>();

	for (const part of field.split(",")) {
		const [rangePart, stepPart] = part.split("/", 2);
		const step = stepPart === undefined ? 1 : Number(stepPart);
		if (!Number.isInteger(step) || step < 1) {
			throw new Error(`Invalid cron step: ${part}`);
		}

		const [start, end] = parseRange(rangePart, min, max);
		for (let value = start; value <= end; value += step) {
			values.add(value);
		}
	}

	if (values.size === 0) {
		throw new Error(`Invalid cron field: ${field}`);
	}

	return {
		any: field === "*",
		values,
	};
}

function parseRange(value: string, min: number, max: number): [number, number] {
	if (value === "*") {
		return [min, max];
	}

	if (value.includes("-")) {
		const [start, end] = value.split("-", 2).map(Number);
		if (!isWithinRange(start, min, max) || !isWithinRange(end, min, max) || start > end) {
			throw new Error(`Invalid cron range: ${value}`);
		}
		return [start, end];
	}

	const parsed = Number(value);
	if (!isWithinRange(parsed, min, max)) {
		throw new Error(`Invalid cron value: ${value}`);
	}
	return [parsed, parsed];
}

function getZonedParts(date: Date, timezone: string): {
	day: number;
	dayOfWeek: number;
	hour: number;
	minute: number;
	month: number;
} {
	const formatter = new Intl.DateTimeFormat("en-US", {
		day: "2-digit",
		hour: "2-digit",
		hourCycle: "h23",
		hour12: false,
		minute: "2-digit",
		month: "2-digit",
		timeZone: timezone,
		weekday: "short",
	});
	const values = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
	return {
		day: Number(values.day),
		dayOfWeek: weekdayNameToNumber(values.weekday),
		hour: Number(values.hour),
		minute: Number(values.minute),
		month: Number(values.month),
	};
}

function normalizeHour(hour: number, meridiem?: string): number {
	if (meridiem === "pm" && hour !== 12) {
		return hour + 12;
	}
	if (meridiem === "am" && hour === 12) {
		return 0;
	}
	return hour;
}

function normalizeTimezone(value: string | undefined, fallbackTimezone: string): string {
	if (!value) {
		return fallbackTimezone;
	}

	const normalized = value.toLowerCase();
	return timezoneAliases[normalized] ?? value;
}

function isValidHour(value: number): boolean {
	return Number.isInteger(value) && value >= 0 && value <= 23;
}

function isValidMinute(value: number): boolean {
	return Number.isInteger(value) && value >= 0 && value <= 59;
}

function isWithinRange(value: number, min: number, max: number): boolean {
	return Number.isInteger(value) && value >= min && value <= max;
}

function weekdayNameToNumber(value: string | undefined): number {
	switch (value) {
		case "Sun":
			return 0;
		case "Mon":
			return 1;
		case "Tue":
			return 2;
		case "Wed":
			return 3;
		case "Thu":
			return 4;
		case "Fri":
			return 5;
		case "Sat":
			return 6;
		default:
			throw new Error(`Unexpected weekday: ${value ?? "unknown"}`);
	}
}
