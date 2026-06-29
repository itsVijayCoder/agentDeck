import { homedir } from "node:os";
import { join } from "node:path";
import type {
	ApprovalDecision,
	EventSink,
	HarnessAdapter,
	HarnessSessionContext,
	HarnessSessionHandle,
	HarnessTask,
	ProbeResult,
	TerminalInput,
	UserSteeringMessage,
} from "@agentdeck/harness";

import type { PtyManager } from "../../../pty/pty-manager.js";
import type { TerminalSessionRegistry } from "../../../pty/terminal-control.js";
import { probeCommand } from "../probe.js";
import { PiJsonRunner } from "./pi.json-runner.js";
import { selectPiMode, type PiRunMode } from "./pi.mode-selection.js";
import { PiPtyRunner } from "./pi.pty-runner.js";
import { PiRpcRunner } from "./pi.rpc-runner.js";
import type { PiRunner } from "./pi.runner.js";
import { PiSdkRunner } from "./pi.sdk-runner.js";

const capabilities = [
	"terminal",
	"repo-aware",
	"code-edit",
	"bash",
	"json-events",
	"rpc",
	"sdk",
	"model-switching",
	"session-branching",
	"message-queue",
	"custom-tools",
] as const;

export class PiAdapter implements HarnessAdapter {
	readonly displayName = "Pi";
	readonly id = "pi";
	readonly kind = "pi" as const;

	constructor(
		private readonly ptyManager: PtyManager,
		private readonly terminalSessions?: TerminalSessionRegistry,
	) {}

	async probe(): Promise<ProbeResult> {
		return probeCommand({
			authPaths: [join(homedir(), ".pi", "agent", "auth.json"), join(homedir(), ".pi", "config.json")],
			capabilities,
			command: "pi",
			kind: "pi",
			suggestedFix: "Install Pi and ensure the pi command is on PATH.",
			versionArgs: ["--version"],
		});
	}

	async createSession(ctx: HarnessSessionContext): Promise<HarnessSessionHandle> {
		const mode = selectPiMode({
			bridgeRuntime: "node",
			isOneShotQueueJob: false,
			needsCustomAgentDeckTools: true,
			requiresProcessIsolation: false,
			requiresRealTerminal: ctx.privacyMode === "local-only",
			requiresUserJumpIn: false,
		});

		return new PiSession(this.ptyManager, ctx, mode, this.terminalSessions);
	}
}

class PiSession implements HarnessSessionHandle {
	readonly agentKind = "pi" as const;
	readonly runId: string;
	private runner: PiRunner | null = null;

	constructor(
		private readonly ptyManager: PtyManager,
		private readonly ctx: HarnessSessionContext,
		private readonly mode: PiRunMode,
		private readonly terminalSessions?: TerminalSessionRegistry,
	) {
		this.runId = ctx.runId;
	}

	async start(task: HarnessTask, sink: EventSink): Promise<void> {
		this.runner = this.createRunner(sink);
		await this.runner.start(task);
	}

	async sendUserMessage(message: UserSteeringMessage): Promise<void> {
		await this.runner?.sendUserMessage(message);
	}

	async sendTerminalInput(input: TerminalInput): Promise<void> {
		await this.runner?.sendTerminalInput(input);
	}

	async approve(requestId: string, decision: ApprovalDecision): Promise<void> {
		await this.runner?.approve(requestId, decision);
	}

	async pause(): Promise<void> {
		await this.runner?.pause();
	}

	async resume(): Promise<void> {
		await this.runner?.resume();
	}

	async cancel(reason: string): Promise<void> {
		await this.runner?.cancel(reason);
	}

	async dispose(): Promise<void> {
		await this.runner?.dispose();
	}

	private createRunner(sink: EventSink): PiRunner {
		switch (this.mode) {
			case "sdk":
				return new PiSdkRunner(this.ctx, sink);
			case "rpc":
				return new PiRpcRunner(this.ctx, sink);
			case "json":
				return new PiJsonRunner(this.ctx, sink);
			case "pty":
				return new PiPtyRunner(this.ptyManager, this.ctx, sink, this.terminalSessions);
		}
	}
}
