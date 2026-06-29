import type { EventEnvelope, TerminalLeaseMode } from "@agentdeck/core";

export type TerminalLeaseState = {
	holderUserId?: string;
	leaseId?: string;
	mode: TerminalLeaseMode;
};

export const defaultTerminalLeaseState: TerminalLeaseState = {
	mode: "agent-control",
};

export function deriveTerminalLeaseStates(events: EventEnvelope[]): Record<string, TerminalLeaseState> {
	const states: Record<string, TerminalLeaseState> = {};

	for (const event of events) {
		if (!event.runId || !event.type.startsWith("terminal.lease_")) {
			continue;
		}

		const current = states[event.runId] ?? defaultTerminalLeaseState;
		const next = reduceTerminalLeaseState(current, event);
		if (next !== current) {
			states[event.runId] = next;
		}
	}

	return states;
}

export function reduceTerminalLeaseState(current: TerminalLeaseState, event: EventEnvelope): TerminalLeaseState {
	if (event.type === "terminal.lease_granted" && isRecord(event.payload)) {
		return {
			holderUserId: typeof event.payload.holderUserId === "string" ? event.payload.holderUserId : undefined,
			leaseId: typeof event.payload.leaseId === "string" ? event.payload.leaseId : undefined,
			mode: isTerminalLeaseMode(event.payload.mode) ? event.payload.mode : "human-control",
		};
	}

	if (event.type === "terminal.lease_released") {
		return defaultTerminalLeaseState;
	}

	return current;
}

export function isTerminalLeaseMode(value: unknown): value is TerminalLeaseMode {
	return value === "agent-control" || value === "human-control" || value === "read-only";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
