import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
	agentEndedEvent,
	agentStartedEvent,
	deliveredMessageEvent,
	queuedMessageEvent,
	terminalClosedEvent,
	terminalStderrEvent,
	terminalStdoutEvent,
	type ApprovalDecision,
	type EventSink,
	type HarnessMode,
	type HarnessSessionContext,
	type HarnessTask,
	type TerminalInput,
	type UserSteeringMessage,
} from "@agentdeck/harness";

import { redact } from "../../../redaction/secrets.js";
import { JsonLineReader } from "./pi-json-lines.js";
import { mapPiEventToAgentDeck } from "./pi.events.js";
import type { PiRunner } from "./pi.runner.js";

export type PiProcessRunnerOptions = {
	args: (task: HarnessTask) => string[];
	harnessMode: HarnessMode;
	sendInitialTaskAsJson?: boolean;
};

export class PiProcessRunner implements PiRunner {
	private child: ChildProcessWithoutNullStreams | null = null;
	private ended = false;
	private readonly reader: JsonLineReader;

	constructor(
		private readonly ctx: HarnessSessionContext,
		private readonly sink: EventSink,
		private readonly options: PiProcessRunnerOptions,
	) {
		this.reader = new JsonLineReader({
			onJson: (event) => {
				for (const mapped of mapPiEventToAgentDeck(event, {
					harnessMode: this.options.harnessMode,
					runId: this.ctx.runId,
				})) {
					this.sink.emit(mapped);
				}
			},
			onText: (line) => {
				this.sink.emit(terminalStdoutEvent({ data: redact(line), runId: this.ctx.runId }));
			},
		});
	}

	async start(task: HarnessTask): Promise<void> {
		if (this.child) {
			throw new Error(`Pi ${this.options.harnessMode} runner for run ${this.ctx.runId} has already started.`);
		}

		this.sink.emit(agentStartedEvent({ agentKind: "pi", harnessMode: this.options.harnessMode, runId: this.ctx.runId }));
		this.child = spawn("pi", this.options.args(task), {
			cwd: this.ctx.worktreePath ?? this.ctx.cwd,
			env: {
				...process.env,
				AGENTDECK_ENTRYPOINT: "bridge",
				AGENTDECK_RUN_ID: this.ctx.runId,
				AGENTDECK_SESSION_ID: this.ctx.sessionId,
			},
			stdio: "pipe",
		});

		this.child.stdout.on("data", (chunk: Buffer) => this.reader.push(chunk.toString("utf8")));
		this.child.stderr.on("data", (chunk: Buffer) => {
			this.sink.emit(terminalStderrEvent({ data: redact(chunk.toString("utf8")), runId: this.ctx.runId }));
		});
		this.child.on("exit", (exitCode, signal) => {
			this.reader.flush();
			this.sink.emit(
				terminalClosedEvent({
					exitCode: exitCode ?? undefined,
					runId: this.ctx.runId,
					signal: signal ?? undefined,
				}),
			);
			this.emitEnded(exitCode === 0 ? "completed" : "failed");
		});

		if (this.options.sendInitialTaskAsJson) {
			this.sendJson({ id: randomUUID(), message: task.prompt, model: task.model, provider: task.provider, type: "prompt" });
		}
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
		this.sendJson({ id: messageId, message: message.content, type: message.kind === "steer-now" ? "steer" : "prompt" });
		this.sink.emit(deliveredMessageEvent({ messageId, runId: this.ctx.runId }));
	}

	async sendTerminalInput(input: TerminalInput): Promise<void> {
		this.child?.stdin.write(input.data);
	}

	async approve(requestId: string, decision: ApprovalDecision): Promise<void> {
		this.sendJson({ decision, id: requestId, type: "approval_decision" });
	}

	async pause(): Promise<void> {
		this.child?.kill("SIGINT");
	}

	async resume(): Promise<void> {
		this.sendJson({ type: "resume" });
	}

	async cancel(reason: string): Promise<void> {
		this.sendJson({ reason, type: "cancel" });
		this.child?.kill("SIGTERM");
		this.emitEnded("cancelled");
	}

	async dispose(): Promise<void> {
		this.child?.kill();
		this.emitEnded("cancelled");
	}

	private sendJson(value: unknown): void {
		this.child?.stdin.write(`${JSON.stringify(value)}\n`);
	}

	private emitEnded(status: "cancelled" | "completed" | "failed"): void {
		if (this.ended) {
			return;
		}
		this.ended = true;
		this.sink.emit(agentEndedEvent({ agentKind: "pi", runId: this.ctx.runId, status }));
	}
}
