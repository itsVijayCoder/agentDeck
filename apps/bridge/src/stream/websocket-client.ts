import WebSocket from "ws";
import type { BrowserControlMessage, BridgeMessage } from "@agentdeck/core";
import type { SessionHubServerMessage } from "@agentdeck/bridge-protocol";
import type { AdapterRegistry } from "@agentdeck/harness";

import { pairingAgentsFromProbeResults } from "../agents/detector.js";
import { createBridgeAdapterRegistry } from "../agents/adapters/registry.js";
import { getStatePath } from "../config.js";
import { ApprovalGate } from "../policy/approval-gate.js";
import { JsonlReplayBuffer } from "../state/jsonl-replay-buffer.js";
import type { BridgeConfig, BridgeRuntimeOptions } from "../types.js";
import {
	TerminalSessionRegistry,
	handleTerminalControlMessage,
	isBrowserControlMessage,
} from "../pty/terminal-control.js";
import { CloudEventSink } from "./event-sink.js";
import { BridgeRunDispatcher, isRunDispatchControlMessage } from "./run-dispatcher.js";

export type BridgeRuntime = {
	adapterRegistry: AdapterRegistry;
	approvalGate: ApprovalGate;
	close(): void;
	runDispatcher: BridgeRunDispatcher;
	sink: CloudEventSink;
	socket: ReconnectingWebSocket;
	terminalSessions: TerminalSessionRegistry;
};

export type StartBridgeOptions = BridgeRuntimeOptions & {
	adapterRegistry?: AdapterRegistry;
	approvalGate?: ApprovalGate;
	onControlMessage?: (message: BrowserControlMessage, handled: boolean) => void;
	terminalSessions?: TerminalSessionRegistry;
};

export type ReconnectingWebSocketOptions = {
	initialDelayMs?: number;
	maxDelayMs?: number;
	onMessage?: (message: SessionHubServerMessage | BrowserControlMessage) => void;
};

export async function startBridge(config: BridgeConfig, options: StartBridgeOptions): Promise<BridgeRuntime> {
	const terminalSessions = options.terminalSessions ?? new TerminalSessionRegistry();
	const adapterRegistry = options.adapterRegistry ?? createBridgeAdapterRegistry({ terminalSessions });
	const approvalGate = options.approvalGate ?? new ApprovalGate();
	let runDispatcher: BridgeRunDispatcher | null = null;
	const socket = new ReconnectingWebSocket(config, options.sessionId, {
		onMessage: (message) => {
			if (isRunDispatchControlMessage(message)) {
				runDispatcher?.dispatch(message).catch((error) => {
					console.error(error instanceof Error ? error.message : String(error));
				});
				return;
			}

			if (!isBrowserControlMessage(message)) {
				return;
			}

			const handled =
				handleApprovalControlMessage(message, approvalGate) ||
				handleTerminalControlMessage(message, terminalSessions) ||
				handleRunControlMessage(message, runDispatcher);
			options.onControlMessage?.(message, handled);
		},
	});
	const sink = new CloudEventSink((data) => socket.send(data), {
		privacyMode: options.privacyMode ?? config.privacyMode,
		replayBuffer: new JsonlReplayBuffer(getStatePath()),
	});
	runDispatcher = new BridgeRunDispatcher({
		adapterRegistry,
		config,
		repoPath: options.repoPath ?? process.env.AGENTDECK_REPO_PATH ?? process.cwd(),
		sink,
		...(options.worktreeBaseDir ? { worktreeBaseDir: options.worktreeBaseDir } : {}),
	});

	socket.setOpenHandler(() => {
		sink.flushReplayBuffer();
		socket.send(
			JSON.stringify({
				machineId: config.machineId,
				sentAt: new Date().toISOString(),
				type: "machine.heartbeat",
			} satisfies BridgeMessage),
		);
	});
	await socket.connect();

	const probeResults = await Promise.all(adapterRegistry.list().map((adapter) => adapter.probe()));
	for (const agent of pairingAgentsFromProbeResults(probeResults)) {
		socket.send(
			JSON.stringify({
				agentKind: agent.kind,
				command: agent.command,
				...(agent.version ? { version: agent.version } : {}),
				type: "agent.detected",
			} satisfies BridgeMessage),
		);
		if (agent.authStatus === "missing") {
			sink.emit({
				payload: { agentKind: agent.kind, suggestedFix: `Authenticate ${agent.kind} before starting runs.` },
				type: "agent.auth_missing",
				visibility: "metadata",
			});
		}
	}
	await sink.flush();

	const heartbeat = setInterval(() => {
		socket.send(
			JSON.stringify({
				machineId: config.machineId,
				sentAt: new Date().toISOString(),
				type: "machine.heartbeat",
			} satisfies BridgeMessage),
		);
	}, options.heartbeatIntervalMs ?? 30_000);

	return {
		adapterRegistry,
		approvalGate,
		close: () => {
			clearInterval(heartbeat);
			socket.close();
		},
		runDispatcher,
		sink,
		socket,
		terminalSessions,
	};
}

function handleApprovalControlMessage(message: BrowserControlMessage, approvalGate: ApprovalGate): boolean {
	if (message.type !== "approval.decide") {
		return false;
	}

	return approvalGate.resolve({
		approvalId: message.approvalId,
		decidedBy: message.userId,
		notes: message.notes,
		status: message.status,
	});
}

function handleRunControlMessage(message: BrowserControlMessage, runDispatcher: BridgeRunDispatcher | null): boolean {
	if (!runDispatcher) {
		return false;
	}

	switch (message.type) {
		case "control.pause":
			runDispatcher.pause(message.runId).catch((error) => {
				console.error(error instanceof Error ? error.message : String(error));
			});
			return true;
		case "control.resume":
			runDispatcher.resume(message.runId).catch((error) => {
				console.error(error instanceof Error ? error.message : String(error));
			});
			return true;
		case "control.cancel":
			runDispatcher.cancel(message.runId, message.reason ?? "Cancelled from Mission Control.").catch((error) => {
				console.error(error instanceof Error ? error.message : String(error));
			});
			return true;
		case "message.follow_up":
			runDispatcher.sendFollowUp(message.runId, message.content, "follow-up").catch((error) => {
				console.error(error instanceof Error ? error.message : String(error));
			});
			return true;
		case "message.steer":
			runDispatcher.sendFollowUp(message.runId, message.content, "steer-now").catch((error) => {
				console.error(error instanceof Error ? error.message : String(error));
			});
			return true;
		default:
			return false;
	}
}

export class ReconnectingWebSocket {
	private delayMs: number;
	private manuallyClosed = false;
	private openHandler: (() => void) | null = null;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private ws: WebSocket | null = null;

	constructor(
		private readonly config: BridgeConfig,
		private readonly sessionId: string,
		private readonly options: ReconnectingWebSocketOptions = {},
	) {
		this.delayMs = options.initialDelayMs ?? 1_000;
	}

	connect(): Promise<void> {
		this.manuallyClosed = false;

		return new Promise((resolve, reject) => {
			const ws = new WebSocket(buildSessionHubWebSocketUrl(this.config, this.sessionId));
			this.ws = ws;
			let settled = false;

			ws.on("open", () => {
				this.delayMs = this.options.initialDelayMs ?? 1_000;
				settled = true;
				this.openHandler?.();
				resolve();
			});

			ws.on("message", (data) => {
				const message = parseWebSocketMessage(data.toString());
				if (message) {
					this.options.onMessage?.(message);
				}
			});

			ws.on("close", () => {
				if (!this.manuallyClosed) {
					this.scheduleReconnect();
				}
			});

			ws.on("error", (error) => {
				if (!settled) {
					settled = true;
					reject(error);
					return;
				}
				console.error(error.message);
			});
		});
	}

	send(data: string): boolean {
		if (this.ws?.readyState !== WebSocket.OPEN) {
			return false;
		}

		this.ws.send(data);
		return true;
	}

	close(): void {
		this.manuallyClosed = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.ws?.close();
	}

	setOpenHandler(handler: () => void): void {
		this.openHandler = handler;
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer) {
			return;
		}

		const delay = this.delayMs;
		this.delayMs = Math.min(delay * 2, this.options.maxDelayMs ?? 30_000);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect().catch((error) => {
				console.error(error instanceof Error ? error.message : String(error));
				this.scheduleReconnect();
			});
		}, delay);
	}
}

export function buildSessionHubWebSocketUrl(config: BridgeConfig, sessionId: string, lastSeq?: number): string {
	const url = new URL(`/api/sessions/${encodeURIComponent(sessionId)}/ws`, config.cloudUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("role", "bridge");
	url.searchParams.set("machineId", config.machineId);
	url.searchParams.set("token", config.token);
	if (lastSeq !== undefined) {
		url.searchParams.set("lastSeq", String(lastSeq));
	}
	return url.toString();
}

function parseWebSocketMessage(raw: string): SessionHubServerMessage | BrowserControlMessage | null {
	try {
		return JSON.parse(raw) as SessionHubServerMessage | BrowserControlMessage;
	} catch {
		return null;
	}
}
