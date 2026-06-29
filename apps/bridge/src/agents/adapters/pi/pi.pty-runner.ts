import {
	agentEndedEvent,
	agentStartedEvent,
	deliveredMessageEvent,
	queuedMessageEvent,
	type ApprovalDecision,
	type EventSink,
	type HarnessSessionContext,
	type HarnessTask,
	type TerminalInput,
	type UserSteeringMessage,
} from "@agentdeck/harness";
import { randomUUID } from "node:crypto";

import type { PtyManager } from "../../../pty/pty-manager.js";
import { TerminalSessionRegistry } from "../../../pty/terminal-control.js";
import { TerminalSession } from "../../../pty/terminal-session.js";
import type { PiRunner } from "./pi.runner.js";

export class PiPtyRunner implements PiRunner {
	private ended = false;
	private terminal: TerminalSession | null = null;

	constructor(
		private readonly ptyManager: PtyManager,
		private readonly ctx: HarnessSessionContext,
		private readonly sink: EventSink,
		private readonly terminalSessions?: TerminalSessionRegistry,
	) {}

	async start(task: HarnessTask): Promise<void> {
		this.sink.emit(agentStartedEvent({ agentKind: "pi", harnessMode: "pty", runId: this.ctx.runId }));
		this.terminal = new TerminalSession(this.ptyManager, this.ctx.runId, this.sink);
		this.terminalSessions?.register(this.terminal);
		this.terminal.start("pi", [task.prompt], {
			cwd: this.ctx.worktreePath ?? this.ctx.cwd,
			env: {
				AGENTDECK_ENTRYPOINT: "bridge",
				AGENTDECK_RUN_ID: this.ctx.runId,
				AGENTDECK_SESSION_ID: this.ctx.sessionId,
			},
		});
	}

	async sendUserMessage(message: UserSteeringMessage): Promise<void> {
		const messageId = randomUUID();
		if (message.kind === "follow-up") {
			this.sink.emit(
				queuedMessageEvent({
					deliveryPolicy: message.deliveryPolicy,
					messageId,
					runId: this.ctx.runId,
				}),
			);
		}
		if (this.terminal?.writeAgentInput(`${message.content}\n`)) {
			this.sink.emit(deliveredMessageEvent({ messageId, runId: this.ctx.runId }));
		}
	}

	async sendTerminalInput(input: TerminalInput): Promise<void> {
		this.terminal?.writeStdin(input.data, input.userId);
	}

	async approve(_requestId: string, decision: ApprovalDecision): Promise<void> {
		this.terminal?.writeAgentInput(decision.status === "approved" ? "y\n" : "n\n");
	}

	async pause(): Promise<void> {
		this.terminal?.kill("SIGINT");
	}

	async resume(): Promise<void> {
		// PTY mode resumes by accepting further stdin.
	}

	async cancel(reason: string): Promise<void> {
		this.terminal?.writeAgentInput(`\n# AgentDeck cancelled this run: ${reason}\n`);
		this.terminal?.kill("SIGTERM");
		this.emitEnded("cancelled");
	}

	async dispose(): Promise<void> {
		this.terminal?.kill();
		this.terminalSessions?.delete(this.ctx.runId);
		this.emitEnded("cancelled");
	}

	private emitEnded(status: "cancelled" | "completed" | "failed"): void {
		if (this.ended) {
			return;
		}
		this.ended = true;
		this.sink.emit(agentEndedEvent({ agentKind: "pi", runId: this.ctx.runId, status }));
	}
}
