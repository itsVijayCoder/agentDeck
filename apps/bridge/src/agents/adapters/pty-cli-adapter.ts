import { randomUUID } from "node:crypto";
import type { AgentCapability, AgentKind } from "@agentdeck/core";
import {
	agentEndedEvent,
	agentStartedEvent,
	deliveredMessageEvent,
	queuedMessageEvent,
	type ApprovalDecision,
	type EventSink,
	type HarnessAdapter,
	type HarnessMode,
	type HarnessSessionContext,
	type HarnessSessionHandle,
	type HarnessTask,
	type ProbeResult,
	type TerminalInput,
	type UserSteeringMessage,
} from "@agentdeck/harness";

import { TerminalSessionRegistry } from "../../pty/terminal-control.js";
import { TerminalSession } from "../../pty/terminal-session.js";
import type { PtyManager, PtySpawnOptions } from "../../pty/pty-manager.js";
import { probeCommand, type CommandProbeOptions } from "./probe.js";

export type PtyCliAdapterSpec = {
	authPaths: readonly string[];
	buildArgs: (task: HarnessTask) => string[];
	capabilities: readonly AgentCapability[];
	command: string;
	displayName: string;
	env?: (ctx: HarnessSessionContext, task: HarnessTask) => Record<string, string>;
	harnessMode: HarnessMode;
	id: string;
	kind: AgentKind;
	suggestedFix?: string;
	versionArgs: readonly string[];
};

export class PtyCliAgentAdapter implements HarnessAdapter {
	readonly displayName: string;
	readonly id: string;
	readonly kind: AgentKind;

	constructor(
		private readonly spec: PtyCliAdapterSpec,
		private readonly ptyManager: PtyManager,
		private readonly terminalSessions?: TerminalSessionRegistry,
		private readonly probeOptions: CommandProbeOptions = {},
	) {
		this.displayName = spec.displayName;
		this.id = spec.id;
		this.kind = spec.kind;
	}

	async probe(): Promise<ProbeResult> {
		return probeCommand(
			{
				authPaths: this.spec.authPaths,
				capabilities: this.spec.capabilities,
				command: this.spec.command,
				kind: this.spec.kind,
				suggestedFix: this.spec.suggestedFix,
				versionArgs: this.spec.versionArgs,
			},
			this.probeOptions,
		);
	}

	async createSession(ctx: HarnessSessionContext): Promise<HarnessSessionHandle> {
		return new PtyCliAgentSession(this.spec, this.ptyManager, ctx, this.terminalSessions);
	}
}

class PtyCliAgentSession implements HarnessSessionHandle {
	readonly agentKind: AgentKind;
	readonly runId: string;
	private ended = false;
	private sink: EventSink | null = null;
	private terminalSession: TerminalSession | null = null;

	constructor(
		private readonly spec: PtyCliAdapterSpec,
		private readonly ptyManager: PtyManager,
		private readonly ctx: HarnessSessionContext,
		private readonly terminalSessions?: TerminalSessionRegistry,
	) {
		this.agentKind = spec.kind;
		this.runId = ctx.runId;
	}

	async start(task: HarnessTask, sink: EventSink): Promise<void> {
		if (this.terminalSession) {
			throw new Error(`Harness session for run ${this.runId} has already started.`);
		}

		this.sink = sink;
		this.sink.emit(
			agentStartedEvent({
				agentKind: this.spec.kind,
				harnessMode: this.spec.harnessMode,
				runId: this.runId,
			}),
		);

		const terminal = new TerminalSession(this.ptyManager, this.runId, sink);
		this.terminalSession = terminal;
		this.terminalSessions?.register(terminal);
		terminal.start(this.spec.command, this.spec.buildArgs(task), this.spawnOptions(task));
	}

	async sendUserMessage(message: UserSteeringMessage): Promise<void> {
		const messageId = randomUUID();
		if (message.kind === "follow-up") {
			this.sink?.emit(
				queuedMessageEvent({
					deliveryPolicy: message.deliveryPolicy,
					messageId,
					runId: this.runId,
				}),
			);
		}

		const delivered = this.terminalSession?.writeAgentInput(`${message.content}\n`) ?? false;
		if (delivered) {
			this.sink?.emit(deliveredMessageEvent({ messageId, runId: this.runId }));
		}
	}

	async sendTerminalInput(input: TerminalInput): Promise<void> {
		this.terminalSession?.writeStdin(input.data, input.userId);
	}

	async approve(_requestId: string, decision: ApprovalDecision): Promise<void> {
		this.terminalSession?.writeAgentInput(decision.status === "approved" ? "y\n" : "n\n");
	}

	async pause(): Promise<void> {
		this.terminalSession?.kill("SIGINT");
	}

	async resume(): Promise<void> {
		// PTY-backed CLIs resume when the process accepts further stdin.
	}

	async cancel(reason: string): Promise<void> {
		this.terminalSession?.writeAgentInput(`\n# AgentDeck cancelled this run: ${reason}\n`);
		this.terminalSession?.kill("SIGTERM");
		this.emitEnded("cancelled");
	}

	async dispose(): Promise<void> {
		this.terminalSession?.kill();
		this.terminalSessions?.delete(this.runId);
		this.emitEnded("cancelled");
	}

	private spawnOptions(task: HarnessTask): PtySpawnOptions {
		return {
			cwd: this.ctx.worktreePath ?? this.ctx.cwd,
			env: {
				AGENTDECK_ENTRYPOINT: "bridge",
				AGENTDECK_RUN_ID: this.runId,
				AGENTDECK_SESSION_ID: this.ctx.sessionId,
				...(task.provider ? { AGENTDECK_PROVIDER: task.provider } : {}),
				...(task.model ? { AGENTDECK_MODEL: task.model } : {}),
				...(this.spec.env?.(this.ctx, task) ?? {}),
			},
		};
	}

	private emitEnded(status: "cancelled" | "completed" | "failed"): void {
		if (this.ended) {
			return;
		}

		this.ended = true;
		this.sink?.emit(
			agentEndedEvent({
				agentKind: this.spec.kind,
				runId: this.runId,
				status,
			}),
		);
	}
}
