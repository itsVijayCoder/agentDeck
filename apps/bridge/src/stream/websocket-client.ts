import WebSocket from "ws";
import type { BrowserControlMessage, BridgeMessage } from "@agentdeck/core";
import type { SessionHubServerMessage } from "@agentdeck/bridge-protocol";

import { detectAgents, pairingAgentsFromProbeResults } from "../agents/detector.js";
import { getStatePath } from "../config.js";
import { JsonlReplayBuffer } from "../state/jsonl-replay-buffer.js";
import type { BridgeConfig, BridgeRuntimeOptions } from "../types.js";
import {
	TerminalSessionRegistry,
	handleTerminalControlMessage,
	isBrowserControlMessage,
} from "../pty/terminal-control.js";
import { CloudEventSink } from "./event-sink.js";

export type BridgeRuntime = {
	close(): void;
	sink: CloudEventSink;
	socket: ReconnectingWebSocket;
	terminalSessions: TerminalSessionRegistry;
};

export type StartBridgeOptions = BridgeRuntimeOptions & {
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
	const socket = new ReconnectingWebSocket(config, options.sessionId, {
		onMessage: (message) => {
			if (!isBrowserControlMessage(message)) {
				return;
			}

			const handled = handleTerminalControlMessage(message, terminalSessions);
			options.onControlMessage?.(message, handled);
		},
	});
	const sink = new CloudEventSink((data) => socket.send(data), {
		privacyMode: options.privacyMode ?? config.privacyMode,
		replayBuffer: new JsonlReplayBuffer(getStatePath()),
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

	const probeResults = await detectAgents();
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
		close: () => {
			clearInterval(heartbeat);
			socket.close();
		},
		sink,
		socket,
		terminalSessions,
	};
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
