import type { BrowserControlMessage, TerminalLeaseMode } from "@agentdeck/core";

import type { TerminalSessionState } from "./terminal-session.js";

export type TerminalControlSession = {
	getState(): TerminalSessionState;
	releaseLease(leaseId: string): boolean;
	requestLease(holderUserId: string, mode?: TerminalLeaseMode): { leaseId?: string; ok: boolean; reason?: string };
	resize(cols: number, rows: number): void;
	writeStdin(data: string, userId: string): boolean;
};

export class TerminalSessionRegistry {
	private readonly sessions = new Map<string, TerminalControlSession>();

	delete(runId: string): boolean {
		return this.sessions.delete(runId);
	}

	get(runId: string): TerminalControlSession | undefined {
		return this.sessions.get(runId);
	}

	list(): TerminalControlSession[] {
		return [...this.sessions.values()];
	}

	register(session: TerminalControlSession): void {
		this.sessions.set(session.getState().runId, session);
	}

	set(runId: string, session: TerminalControlSession): void {
		this.sessions.set(runId, session);
	}
}

export function handleTerminalControlMessage(
	message: BrowserControlMessage,
	registry: TerminalSessionRegistry,
): boolean {
	const runId = runIdForTerminalControl(message);
	if (!runId) {
		return false;
	}

	const session = registry.get(runId);
	if (!session) {
		return false;
	}

	switch (message.type) {
		case "terminal.stdin":
			return session.writeStdin(message.data, message.userId ?? "unknown");
		case "terminal.resize":
			session.resize(message.cols, message.rows);
			return true;
		case "terminal.lease.request":
			return session.requestLease(message.userId ?? "unknown", message.mode).ok;
		case "terminal.lease.release":
			return session.releaseLease(message.leaseId);
		default:
			return false;
	}
}

export function isBrowserControlMessage(message: unknown): message is BrowserControlMessage {
	return isRecord(message) && typeof message.type === "string" && isKnownBrowserControlType(message.type);
}

function runIdForTerminalControl(message: BrowserControlMessage): string | null {
	switch (message.type) {
		case "terminal.stdin":
		case "terminal.resize":
		case "terminal.lease.request":
		case "terminal.lease.release":
			return message.runId;
		default:
			return null;
	}
}

function isKnownBrowserControlType(type: string): boolean {
	return (
		type === "control.pause" ||
		type === "control.resume" ||
		type === "control.cancel" ||
		type === "terminal.stdin" ||
		type === "terminal.resize" ||
		type === "terminal.lease.request" ||
		type === "terminal.lease.release" ||
		type === "message.steer" ||
		type === "message.follow_up" ||
		type === "approval.decide"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
