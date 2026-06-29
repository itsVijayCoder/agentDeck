import { createHash } from "node:crypto";
import type { RunDispatchControlMessage } from "@agentdeck/core";
import type { AdapterRegistry, EventSink, HarnessSessionHandle } from "@agentdeck/harness";
import type { VerifierResult } from "@agentdeck/verifier";

import { PatchGenerator } from "../repo/patch-generator.js";
import { createWorktree, type WorktreeDescriptor } from "../repo/worktree.js";
import { BridgeVerifierRunner } from "../verifier/verifier-runner.js";
import type { BridgeConfig } from "../types.js";
import { R2Writer } from "./r2-writer.js";
import type { CloudEventSink } from "./event-sink.js";

export type BridgeRunDispatcherOptions = {
	adapterRegistry: AdapterRegistry;
	config: BridgeConfig;
	repoPath: string;
	sink: CloudEventSink;
	worktreeBaseDir?: string;
};

export class BridgeRunDispatcher {
	private readonly activeRuns = new Map<string, HarnessSessionHandle>();

	constructor(private readonly options: BridgeRunDispatcherOptions) {}

	async dispatch(message: RunDispatchControlMessage): Promise<boolean> {
		if (message.machineId !== this.options.config.machineId) {
			return false;
		}

		if (this.activeRuns.has(message.runId)) {
			this.options.sink.emit({
				payload: { runId: message.runId, status: "running" },
				runId: message.runId,
				source: "bridge",
				type: "run.status",
				visibility: "metadata",
			});
			return true;
		}

		try {
			const adapter = this.options.adapterRegistry.require(message.agentKind);
			const worktree = await createWorktree(this.options.repoPath, message.runId, message.worktreeBranch ?? `agentdeck/${message.runId}`, {
				baseDir: this.options.worktreeBaseDir,
				targetRef: message.targetBranch,
			});
			const session = await adapter.createSession({
				cwd: this.options.repoPath,
				privacyMode: message.privacyMode,
				runId: message.runId,
				sessionId: message.sessionId,
				workspaceId: message.workspaceId,
				worktreePath: worktree.path,
			});
			this.activeRuns.set(message.runId, session);

			const lifecycleSink = new RunLifecycleSink(this.options.sink, {
				dispatcher: this,
				message,
				worktree,
			});

			this.options.sink.emit({
				payload: {
					...(message.candidateId ? { candidateId: message.candidateId } : {}),
					status: "running",
					worktreePathHash: hashString(worktree.path),
				},
				runId: message.runId,
				source: "bridge",
				type: "run.started",
				visibility: "metadata",
			});
			await session.start(
				{
					prompt: message.task,
					...(message.model ? { model: message.model } : {}),
					...(message.provider ? { provider: message.provider } : {}),
				},
				lifecycleSink,
			);
			await this.options.sink.flush();
			return true;
		} catch (error) {
			this.options.sink.emit({
				payload: {
					error: error instanceof Error ? error.message : String(error),
					retryable: false,
				},
				runId: message.runId,
				source: "bridge",
				type: "run.failed",
				visibility: "metadata",
			});
			await this.options.sink.flush();
			return true;
		}
	}

	async cancel(runId: string, reason: string): Promise<boolean> {
		const session = this.activeRuns.get(runId);
		if (!session) {
			return false;
		}
		await session.cancel(reason);
		this.activeRuns.delete(runId);
		return true;
	}

	async pause(runId: string): Promise<boolean> {
		const session = this.activeRuns.get(runId);
		if (!session) {
			return false;
		}
		await session.pause();
		return true;
	}

	async resume(runId: string): Promise<boolean> {
		const session = this.activeRuns.get(runId);
		if (!session) {
			return false;
		}
		await session.resume();
		return true;
	}

	async sendFollowUp(runId: string, content: string, kind: "follow-up" | "steer-now"): Promise<boolean> {
		const session = this.activeRuns.get(runId);
		if (!session) {
			return false;
		}
		await session.sendUserMessage({
			content,
			deliveryPolicy: kind === "follow-up" ? "after-run-completes" : "after-current-turn",
			kind,
		});
		return true;
	}

	async finalize(message: RunDispatchControlMessage, worktree: WorktreeDescriptor, exitCode?: number): Promise<void> {
		const runStatus = exitCode === 0 ? "completed" : "failed";
		let finalStatus = runStatus;

		if (runStatus === "completed") {
			const verifierResults = await this.runVerifiers(message, worktree);
			if (verifierResults.some((result) => result.status === "failed" || result.status === "cancelled")) {
				finalStatus = "failed";
			}
			await this.writePatch(message, worktree);
		}

		this.options.sink.emit({
			payload:
				finalStatus === "completed"
					? { confidence: 0.85 }
					: { error: "Run finished with a failed terminal or verifier status.", retryable: true },
			runId: message.runId,
			source: "bridge",
			type: finalStatus === "completed" ? "run.completed" : "run.failed",
			visibility: "metadata",
		});
		this.activeRuns.delete(message.runId);
		await this.options.sink.flush();
	}

	private async runVerifiers(message: RunDispatchControlMessage, worktree: WorktreeDescriptor): Promise<VerifierResult[]> {
		const runner = new BridgeVerifierRunner({
			r2Writer: new R2Writer({
				privacyMode: message.privacyMode,
				send: (upload) => this.options.sink.sendBridgeMessage(upload),
			}),
			sink: this.options.sink,
		});

		return runner.run({
			repoPath: worktree.path,
			runId: message.runId,
			sessionId: message.sessionId,
			workspaceId: message.workspaceId,
		});
	}

	private async writePatch(message: RunDispatchControlMessage, worktree: WorktreeDescriptor): Promise<void> {
		const patch = await new PatchGenerator().generate({
			baseCommit: worktree.baseCommit,
			runId: message.runId,
			worktreePath: worktree.path,
		});
		const writer = new R2Writer({
			privacyMode: message.privacyMode,
			send: (upload) => this.options.sink.sendBridgeMessage(upload),
		});
		await writer.writePatch({
			artifactId: patch.id,
			diff: patch.diff,
			runId: message.runId,
			sessionId: message.sessionId,
			workspaceId: message.workspaceId,
		});
	}
}

class RunLifecycleSink implements EventSink {
	private finalized = false;

	constructor(
		private readonly sink: CloudEventSink,
		private readonly context: {
			dispatcher: BridgeRunDispatcher;
			message: RunDispatchControlMessage;
			worktree: WorktreeDescriptor;
		},
	) {}

	emit(event: Parameters<EventSink["emit"]>[0]): void {
		this.sink.emit(event);
		if (event.type !== "terminal.closed" || this.finalized) {
			return;
		}

		this.finalized = true;
		const exitCode = isRecord(event.payload) && typeof event.payload.exitCode === "number" ? event.payload.exitCode : undefined;
		this.context.dispatcher.finalize(this.context.message, this.context.worktree, exitCode).catch((error) => {
			this.sink.emit({
				payload: {
					error: error instanceof Error ? error.message : String(error),
					retryable: true,
				},
				runId: this.context.message.runId,
				source: "bridge",
				type: "run.failed",
				visibility: "metadata",
			});
			this.sink.flush().catch((flushError) => {
				console.error(flushError instanceof Error ? flushError.message : String(flushError));
			});
		});
	}

	flush(): Promise<void> {
		return this.sink.flush();
	}
}

export function isRunDispatchControlMessage(message: unknown): message is RunDispatchControlMessage {
	return (
		isRecord(message) &&
		message.type === "run.dispatch" &&
			typeof message.agentInstallationId === "string" &&
			isAgentKind(message.agentKind) &&
			(message.candidateId === undefined || typeof message.candidateId === "string") &&
			(message.candidateLabel === undefined || typeof message.candidateLabel === "string") &&
			typeof message.machineId === "string" &&
			(message.orchestrationId === undefined || typeof message.orchestrationId === "string") &&
			isPrivacyMode(message.privacyMode) &&
			typeof message.queueItemId === "string" &&
			typeof message.runId === "string" &&
			(message.routingStrategy === undefined || isRoutingStrategy(message.routingStrategy)) &&
			typeof message.sessionId === "string" &&
			typeof message.targetBranch === "string" &&
			typeof message.task === "string" &&
			(message.worktreeBranch === undefined || typeof message.worktreeBranch === "string") &&
			typeof message.workspaceId === "string" &&
		(message.model === undefined || typeof message.model === "string") &&
		(message.provider === undefined || typeof message.provider === "string") &&
		(message.scheduledJobId === undefined || typeof message.scheduledJobId === "string")
	);
}

function hashString(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgentKind(value: unknown): value is RunDispatchControlMessage["agentKind"] {
	return (
		value === "claude-code" ||
		value === "codex" ||
		value === "opencode" ||
		value === "qwen-code" ||
		value === "pi" ||
		value === "aider" ||
		value === "acp"
	);
}

function isPrivacyMode(value: unknown): value is RunDispatchControlMessage["privacyMode"] {
	return value === "local-only" || value === "metadata-only" || value === "full-sync";
}

function isRoutingStrategy(value: unknown): value is NonNullable<RunDispatchControlMessage["routingStrategy"]> {
	return (
		value === "cascade" ||
		value === "frontier-fallback" ||
		value === "local-only" ||
		value === "parallel-candidates" ||
		value === "single"
	);
}
