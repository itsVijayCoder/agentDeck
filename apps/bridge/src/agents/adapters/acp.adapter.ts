import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
	agentEndedEvent,
	agentStartedEvent,
	assistantDeltaEvent,
	deliveredMessageEvent,
	queuedMessageEvent,
	terminalClosedEvent,
	terminalStderrEvent,
	terminalStdoutEvent,
	type ApprovalDecision,
	type EventSink,
	type HarnessAdapter,
	type HarnessSessionContext,
	type HarnessSessionHandle,
	type HarnessTask,
	type ProbeResult,
	type TerminalInput,
	type UserSteeringMessage,
} from "@agentdeck/harness";

import { redact } from "../../redaction/secrets.js";
import { JsonLineReader } from "./pi/pi-json-lines.js";
import { probeCommand } from "./probe.js";

const capabilities = ["terminal", "repo-aware", "code-edit", "bash", "acp", "json-events", "rpc"] as const;

export class AcpAdapter implements HarnessAdapter {
	readonly displayName = "ACP Agent";
	readonly id = "acp";
	readonly kind = "acp" as const;

	constructor(private readonly command = process.env.AGENTDECK_ACP_COMMAND ?? "acp") {}

	async probe(): Promise<ProbeResult> {
		return probeCommand({
			authPaths: [join(homedir(), ".config", "acp", "config.json")],
			capabilities,
			command: this.command,
			kind: "acp",
			suggestedFix: "Configure an ACP-compatible agent command with AGENTDECK_ACP_COMMAND.",
			versionArgs: ["--version"],
		});
	}

	async createSession(ctx: HarnessSessionContext): Promise<HarnessSessionHandle> {
		return new AcpSession(this.command, ctx);
	}
}

class AcpSession implements HarnessSessionHandle {
	readonly agentKind = "acp" as const;
	readonly runId: string;
	private child: ChildProcessWithoutNullStreams | null = null;
	private ended = false;
	private reader: JsonLineReader | null = null;
	private sink: EventSink | null = null;

	constructor(
		private readonly command: string,
		private readonly ctx: HarnessSessionContext,
	) {
		this.runId = ctx.runId;
	}

	async start(task: HarnessTask, sink: EventSink): Promise<void> {
		if (this.child) {
			throw new Error(`ACP session for run ${this.runId} has already started.`);
		}

		this.sink = sink;
		this.reader = new JsonLineReader({
			onJson: (message) => this.handleRpcMessage(message),
			onText: (line) => this.sink?.emit(terminalStdoutEvent({ data: redact(line), runId: this.runId })),
		});
		sink.emit(agentStartedEvent({ agentKind: "acp", harnessMode: "acp-stdio", runId: this.runId }));

		this.child = spawn(this.command, [], {
			cwd: this.ctx.worktreePath ?? this.ctx.cwd,
			env: {
				...process.env,
				AGENTDECK_ENTRYPOINT: "bridge",
				AGENTDECK_RUN_ID: this.ctx.runId,
				AGENTDECK_SESSION_ID: this.ctx.sessionId,
			},
			stdio: "pipe",
		});
		this.child.stdout.on("data", (chunk: Buffer) => this.reader?.push(chunk.toString("utf8")));
		this.child.stderr.on("data", (chunk: Buffer) => {
			this.sink?.emit(terminalStderrEvent({ data: redact(chunk.toString("utf8")), runId: this.runId }));
		});
		this.child.on("exit", (exitCode, signal) => {
			this.reader?.flush();
			this.sink?.emit(terminalClosedEvent({ exitCode: exitCode ?? undefined, runId: this.runId, signal: signal ?? undefined }));
			this.emitEnded(exitCode === 0 ? "completed" : "failed");
		});

		this.sendRpc("initialize", { client: "agentdeck", runId: this.runId });
		this.sendRpc("task/start", {
			model: task.model,
			prompt: task.prompt,
			provider: task.provider,
			runId: this.runId,
		});
	}

	async sendUserMessage(message: UserSteeringMessage): Promise<void> {
		const messageId = randomUUID();
		if (message.kind === "follow-up") {
			this.sink?.emit(queuedMessageEvent({ deliveryPolicy: message.deliveryPolicy, messageId, runId: this.runId }));
		}
		this.sendRpc(message.kind === "steer-now" ? "task/steer" : "task/followUp", {
			content: message.content,
			messageId,
			runId: this.runId,
		});
		this.sink?.emit(deliveredMessageEvent({ messageId, runId: this.runId }));
	}

	async sendTerminalInput(input: TerminalInput): Promise<void> {
		this.child?.stdin.write(input.data);
	}

	async approve(requestId: string, decision: ApprovalDecision): Promise<void> {
		this.sendRpc("approval/decide", { decision, requestId });
	}

	async pause(): Promise<void> {
		this.child?.kill("SIGINT");
	}

	async resume(): Promise<void> {
		this.sendRpc("task/resume", { runId: this.runId });
	}

	async cancel(reason: string): Promise<void> {
		this.sendRpc("task/cancel", { reason, runId: this.runId });
		this.child?.kill("SIGTERM");
		this.emitEnded("cancelled");
	}

	async dispose(): Promise<void> {
		this.child?.kill();
		this.emitEnded("cancelled");
	}

	private handleRpcMessage(message: unknown): void {
		if (!isRecord(message)) {
			return;
		}

		const params = isRecord(message.params) ? message.params : message;
		const content = stringField(params, "delta") ?? stringField(params, "text") ?? stringField(params, "content");
		if (content) {
			this.sink?.emit(
				assistantDeltaEvent({
					delta: redact(content),
					messageId: stringField(params, "messageId") ?? `acp-${this.runId}`,
					runId: this.runId,
				}),
			);
		}
	}

	private sendRpc(method: string, params: Record<string, unknown>): void {
		this.child?.stdin.write(`${JSON.stringify({ id: randomUUID(), jsonrpc: "2.0", method, params })}\n`);
	}

	private emitEnded(status: "cancelled" | "completed" | "failed"): void {
		if (this.ended) {
			return;
		}

		this.ended = true;
		this.sink?.emit(agentEndedEvent({ agentKind: "acp", runId: this.runId, status }));
	}
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
