export type QueueAllowedWindow = {
	days: string[];
	end: string;
	start: string;
	timezone: string;
};

export type QueuePolicy = {
	allowedHours: QueueAllowedWindow[];
	autoCreateReport: boolean;
	maxConcurrentRunsPerMachine: number;
	requireApprovalBeforeGitPush: true;
	requireApprovalBeforeInstall: boolean;
	requireApprovalBeforeNetwork: boolean;
	requireCleanWorktree: boolean;
	useGitWorktrees: boolean;
};

export type DispatchDecision =
	| { dispatch: true; reason: "OK" }
	| { dispatch: false; reason: "No machine online" | "Max concurrent runs reached" | "Outside allowed hours" };

export const defaultQueuePolicy: QueuePolicy = {
	allowedHours: [],
	autoCreateReport: true,
	maxConcurrentRunsPerMachine: 1,
	requireApprovalBeforeGitPush: true,
	requireApprovalBeforeInstall: true,
	requireApprovalBeforeNetwork: true,
	requireCleanWorktree: true,
	useGitWorktrees: true,
};

export function queuePolicyFromScheduleWindow(value: unknown): QueuePolicy {
	if (!isRecord(value)) {
		return defaultQueuePolicy;
	}

	return {
		...defaultQueuePolicy,
		allowedHours: parseAllowedHours(value.allowedHours),
		autoCreateReport: typeof value.autoCreateReport === "boolean" ? value.autoCreateReport : defaultQueuePolicy.autoCreateReport,
		maxConcurrentRunsPerMachine:
			typeof value.maxConcurrentRunsPerMachine === "number" &&
			Number.isInteger(value.maxConcurrentRunsPerMachine) &&
			value.maxConcurrentRunsPerMachine > 0
				? value.maxConcurrentRunsPerMachine
				: defaultQueuePolicy.maxConcurrentRunsPerMachine,
		requireApprovalBeforeInstall:
			typeof value.requireApprovalBeforeInstall === "boolean"
				? value.requireApprovalBeforeInstall
				: defaultQueuePolicy.requireApprovalBeforeInstall,
		requireApprovalBeforeNetwork:
			typeof value.requireApprovalBeforeNetwork === "boolean"
				? value.requireApprovalBeforeNetwork
				: defaultQueuePolicy.requireApprovalBeforeNetwork,
		requireCleanWorktree:
			typeof value.requireCleanWorktree === "boolean" ? value.requireCleanWorktree : defaultQueuePolicy.requireCleanWorktree,
		useGitWorktrees: typeof value.useGitWorktrees === "boolean" ? value.useGitWorktrees : defaultQueuePolicy.useGitWorktrees,
	};
}

export function isWithinAllowedHours(policy: QueuePolicy, now: Date, fallbackTimezone = "UTC"): boolean {
	if (policy.allowedHours.length === 0) {
		return true;
	}

	for (const window of policy.allowedHours) {
		const timezone = window.timezone || fallbackTimezone;
		const dayName = now.toLocaleDateString("en-US", { timeZone: timezone, weekday: "long" });
		const time = now.toLocaleTimeString("en-US", {
			hour: "2-digit",
			hour12: false,
			minute: "2-digit",
			timeZone: timezone,
		});

		if (window.days.includes(dayName) && isTimeWithinWindow(time, window.start, window.end)) {
			return true;
		}
	}

	return false;
}

export function shouldDispatch(input: {
	concurrentRuns: number;
	machineOnline: boolean;
	now: Date;
	policy: QueuePolicy;
	timezone?: string;
}): DispatchDecision {
	if (!input.machineOnline) {
		return { dispatch: false, reason: "No machine online" };
	}

	if (input.concurrentRuns >= input.policy.maxConcurrentRunsPerMachine) {
		return { dispatch: false, reason: "Max concurrent runs reached" };
	}

	if (!isWithinAllowedHours(input.policy, input.now, input.timezone)) {
		return { dispatch: false, reason: "Outside allowed hours" };
	}

	return { dispatch: true, reason: "OK" };
}

function parseAllowedHours(value: unknown): QueueAllowedWindow[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter(isAllowedWindow);
}

function isAllowedWindow(value: unknown): value is QueueAllowedWindow {
	return (
		isRecord(value) &&
		Array.isArray(value.days) &&
		value.days.every((day) => typeof day === "string") &&
		typeof value.start === "string" &&
		typeof value.end === "string" &&
		typeof value.timezone === "string"
	);
}

function isTimeWithinWindow(time: string, start: string, end: string): boolean {
	if (start <= end) {
		return time >= start && time <= end;
	}

	return time >= start || time <= end;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
