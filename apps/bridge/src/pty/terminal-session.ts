import { randomUUID } from "node:crypto";
import { transitionTerminalLease, type TerminalLeaseMode } from "@agentdeck/core";

import type { EventSink } from "../stream/event-sink.js";
import type { BridgeEventDraft } from "../types.js";
import type { PtyManager, PtySession, PtySpawnOptions } from "./pty-manager.js";

export type TerminalSessionState = {
	leaseId?: string;
	leaseMode: TerminalLeaseMode;
	pid?: number;
	runId: string;
	started: boolean;
};

export type HumanInputAuditEntry = {
	data: string;
	timestamp: string;
	userId: string;
};

export class TerminalSession {
	private readonly humanInputLog: HumanInputAuditEntry[] = [];
	private leaseId: string | undefined;
	private leaseMode: TerminalLeaseMode = "agent-control";
	private pty: PtySession | null = null;

	constructor(
		private readonly ptyManager: PtyManager,
		private readonly runId: string,
		private readonly sink: EventSink,
	) {}

	start(command: string, args: string[], options: PtySpawnOptions): void {
		if (this.pty) {
			throw new Error(`Terminal session for run ${this.runId} has already started.`);
		}

		this.pty = this.ptyManager.spawn(command, args, options);
		this.emit({
			payload: { cols: options.cols ?? 80, rows: options.rows ?? 24 },
			type: "terminal.open",
			visibility: "metadata",
		});

		this.pty.onData((data) => {
			this.emit({
				payload: { data },
				type: "terminal.stdout",
				visibility: "local-only",
			});
		});

		this.pty.onExit((exit) => {
			this.emit({
				payload: {
					exitCode: exit.exitCode,
					...(exit.signal === undefined ? {} : { signal: String(exit.signal) }),
				},
				type: "terminal.closed",
				visibility: "metadata",
			});
		});
	}

	writeStdin(data: string, userId: string): boolean {
		if (this.leaseMode !== "human-control" || !this.pty) {
			return false;
		}

		this.pty.write(data);
		this.humanInputLog.push({ data, timestamp: new Date().toISOString(), userId });
		this.emit({
			payload: { data, userId },
			type: "terminal.stdin",
			visibility: "local-only",
		});
		return true;
	}

	resize(cols: number, rows: number): void {
		this.pty?.resize(cols, rows);
		this.emit({
			payload: { cols, rows },
			type: "terminal.resize",
			visibility: "metadata",
		});
	}

	writeAgentInput(data: string): boolean {
		if (!this.pty) {
			return false;
		}

		this.pty.write(data);
		return true;
	}

	requestLease(holderUserId: string, mode: TerminalLeaseMode = "human-control"): { leaseId?: string; ok: boolean; reason?: string } {
		const transition = transitionTerminalLease(this.leaseMode, mode);
		if (!transition.ok) {
			return { ok: false, reason: transition.reason };
		}

		this.leaseMode = mode;
		this.leaseId = randomUUID();
		this.emit({
			payload: { holderUserId, leaseId: this.leaseId, mode },
			type: "terminal.lease_granted",
			visibility: "metadata",
		});
		return { leaseId: this.leaseId, ok: true };
	}

	releaseLease(leaseId: string): boolean {
		if (this.leaseId !== leaseId) {
			return false;
		}

		const transition = transitionTerminalLease(this.leaseMode, "agent-control");
		if (!transition.ok) {
			return false;
		}

		this.leaseMode = "agent-control";
		this.leaseId = undefined;
		this.emit({
			payload: { leaseId },
			type: "terminal.lease_released",
			visibility: "metadata",
		});
		return true;
	}

	kill(signal?: string): void {
		this.pty?.kill(signal);
	}

	getHumanInputLog(): HumanInputAuditEntry[] {
		return [...this.humanInputLog];
	}

	getState(): TerminalSessionState {
		return {
			...(this.leaseId ? { leaseId: this.leaseId } : {}),
			leaseMode: this.leaseMode,
			...(this.pty ? { pid: this.pty.pid } : {}),
			runId: this.runId,
			started: this.pty !== null,
		};
	}

	private emit(event: Omit<BridgeEventDraft, "runId" | "source">): void {
		this.sink.emit({
			...event,
			runId: this.runId,
			source: "bridge",
		});
	}
}
