"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserControlMessage, EventEnvelope } from "@agentdeck/core";
import type {
	SessionHubConnectionEstablished,
	SessionHubErrorMessage,
	SessionHubServerMessage,
} from "@agentdeck/bridge-protocol";

type SessionWebSocketState = {
	connected: boolean;
	error: SessionHubErrorMessage | null;
	events: EventEnvelope[];
	lastSeq: number;
	send: (message: BrowserControlMessage) => boolean;
};

const RECONNECT_BASE_DELAY_MS = 750;
const RECONNECT_MAX_DELAY_MS = 10_000;

export function useSessionWebSocket(sessionId: string | null): SessionWebSocketState {
	const [connected, setConnected] = useState(false);
	const [error, setError] = useState<SessionHubErrorMessage | null>(null);
	const [events, setEvents] = useState<EventEnvelope[]>([]);
	const [lastSeq, setLastSeq] = useState(-1);
	const lastSeqRef = useRef(-1);
	const manuallyClosedRef = useRef(false);
	const connectRef = useRef<(() => void) | null>(null);
	const reconnectAttemptsRef = useRef(0);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const wsRef = useRef<WebSocket | null>(null);

	const closeSocket = useCallback(() => {
		manuallyClosedRef.current = true;
		if (reconnectTimerRef.current) {
			clearTimeout(reconnectTimerRef.current);
			reconnectTimerRef.current = null;
		}
		wsRef.current?.close();
		wsRef.current = null;
		setConnected(false);
	}, []);

	const connect = useCallback(() => {
		if (!sessionId || typeof window === "undefined") {
			return;
		}

		if (isLocalNextDevHost(window.location)) {
			reconnectTimerRef.current = setTimeout(() => {
				setConnected(false);
				setError({
					code: "BRIDGE_UNAVAILABLE",
					message: "SessionHub WebSocket disabled in local Next dev.",
					type: "error",
				});
			}, 0);
			return;
		}

		manuallyClosedRef.current = false;
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const url = new URL(`${protocol}//${window.location.host}/api/sessions/${encodeURIComponent(sessionId)}/ws`);
		url.searchParams.set("role", "browser");
		url.searchParams.set("lastSeq", String(lastSeqRef.current));

		const ws = new WebSocket(url);
		wsRef.current = ws;

		ws.onopen = () => {
			reconnectAttemptsRef.current = 0;
			setConnected(true);
			setError(null);
		};

		ws.onmessage = (event) => {
			const message = parseServerMessage(event.data);
			if (!message) {
				return;
			}

			if (isConnectionEstablished(message)) {
				setLastSeq((current) => Math.max(current, message.lastSeq));
				lastSeqRef.current = Math.max(lastSeqRef.current, message.lastSeq);
				return;
			}

			if (isSessionHubError(message)) {
				setError(message);
				return;
			}

			if (!isEventEnvelope(message)) {
				return;
			}

			lastSeqRef.current = Math.max(lastSeqRef.current, message.seq);
			setLastSeq(lastSeqRef.current);
			setEvents((current) => [...current, message].slice(-500));
		};

		ws.onclose = () => {
			setConnected(false);
			if (manuallyClosedRef.current) {
				return;
			}

			const attempt = reconnectAttemptsRef.current;
			reconnectAttemptsRef.current += 1;
			const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
			reconnectTimerRef.current = setTimeout(() => connectRef.current?.(), delay);
		};

		ws.onerror = () => {
			setError({ code: "BAD_MESSAGE", message: "Session WebSocket error.", type: "error" });
		};
	}, [sessionId]);

	useEffect(() => {
		connectRef.current = connect;
	}, [connect]);

	useEffect(() => {
		connect();
		return closeSocket;
	}, [closeSocket, connect]);

	const send = useCallback((message: BrowserControlMessage): boolean => {
		if (wsRef.current?.readyState !== WebSocket.OPEN) {
			return false;
		}
		wsRef.current.send(JSON.stringify(message));
		return true;
	}, []);

	return { connected, error, events, lastSeq, send };
}

function parseServerMessage(value: unknown): SessionHubServerMessage | null {
	if (typeof value !== "string") {
		return null;
	}

	try {
		return JSON.parse(value) as SessionHubServerMessage;
	} catch {
		return null;
	}
}

function isConnectionEstablished(message: SessionHubServerMessage): message is SessionHubConnectionEstablished {
	return message.type === "connection.established";
}

function isSessionHubError(message: SessionHubServerMessage): message is SessionHubErrorMessage {
	return message.type === "error";
}

function isEventEnvelope(message: SessionHubServerMessage): message is EventEnvelope {
	const candidate: unknown = message;
	return isRecord(candidate) && typeof candidate.seq === "number" && typeof candidate.id === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isLocalNextDevHost(location: Location): boolean {
	return process.env.NODE_ENV === "development" && (location.hostname === "localhost" || location.hostname === "127.0.0.1");
}
