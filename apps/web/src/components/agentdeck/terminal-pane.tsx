"use client";

import { useEffect, useRef } from "react";
import { Terminal, type IDisposable, type Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import type { BrowserControlMessage, EventEnvelope, TerminalLeaseMode } from "@agentdeck/core";

const TERMINAL_FONT_FAMILY = "var(--font-geist-mono), SFMono-Regular, Consolas, monospace";

export function TerminalPane({
	className,
	events,
	initialTranscript,
	leaseMode,
	onControl,
	runId,
}: {
	className?: string;
	events: EventEnvelope[];
	initialTranscript?: string;
	leaseMode: TerminalLeaseMode;
	onControl: (message: BrowserControlMessage) => boolean;
	runId: string;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const fitRef = useRef<FitAddon | null>(null);
	const lastSeqRef = useRef(-1);
	const leaseModeRef = useRef(leaseMode);
	const resizeRef = useRef<{ cols: number; rows: number } | null>(null);
	const terminalRef = useRef<XTerm | null>(null);

	useEffect(() => {
		leaseModeRef.current = leaseMode;
		const terminal = terminalRef.current;
		if (!terminal) {
			return;
		}

		terminal.options.disableStdin = leaseMode !== "human-control";
		if (leaseMode === "human-control") {
			terminal.focus();
		} else {
			terminal.blur();
		}
	}, [leaseMode]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return undefined;
		}

		const theme = readTerminalTheme(container);
		const terminal = new Terminal({
			convertEol: false,
			cursorBlink: true,
			cursorInactiveStyle: "outline",
			disableStdin: leaseModeRef.current !== "human-control",
			fontFamily: TERMINAL_FONT_FAMILY,
			fontSize: 12,
			fontWeight: 500,
			lineHeight: 1.45,
			minimumContrastRatio: 4.5,
			scrollback: 10_000,
			tabStopWidth: 4,
			theme,
		});
		const fit = new FitAddon();
		const disposables: IDisposable[] = [];

		terminal.loadAddon(fit);
		terminal.loadAddon(
			new WebLinksAddon((_event, uri) => {
				window.open(uri, "_blank", "noopener,noreferrer");
			}),
		);
		terminal.open(container);
		terminalRef.current = terminal;
		fitRef.current = fit;

		if (initialTranscript) {
			terminal.write(initialTranscript);
		}

		const sendResize = () => {
			const dimensions = fit.proposeDimensions();
			if (!dimensions) {
				return;
			}

			fit.fit();
			const nextSize = { cols: terminal.cols, rows: terminal.rows };
			const previousSize = resizeRef.current;
			if (previousSize?.cols === nextSize.cols && previousSize.rows === nextSize.rows) {
				return;
			}

			resizeRef.current = nextSize;
			onControl({
				cols: nextSize.cols,
				rows: nextSize.rows,
				runId,
				type: "terminal.resize",
			});
		};

		let resizeAnimationFrame = 0;
		const scheduleResize = () => {
			cancelAnimationFrame(resizeAnimationFrame);
			resizeAnimationFrame = requestAnimationFrame(sendResize);
		};

		const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleResize);
		resizeObserver?.observe(container);
		scheduleResize();

		disposables.push(
			terminal.onData((data) => {
				if (leaseModeRef.current !== "human-control") {
					return;
				}

				onControl({
					data,
					runId,
					type: "terminal.stdin",
				});
			}),
			terminal.onBinary((data) => {
				if (leaseModeRef.current !== "human-control") {
					return;
				}

				onControl({
					data,
					runId,
					type: "terminal.stdin",
				});
			}),
		);

		return () => {
			cancelAnimationFrame(resizeAnimationFrame);
			resizeObserver?.disconnect();
			for (const disposable of disposables) {
				disposable.dispose();
			}
			terminal.dispose();
			fitRef.current = null;
			terminalRef.current = null;
			resizeRef.current = null;
		};
	}, [initialTranscript, onControl, runId]);

	useEffect(() => {
		const terminal = terminalRef.current;
		if (!terminal) {
			return;
		}

		for (const event of events) {
			if (event.seq <= lastSeqRef.current || event.runId !== runId) {
				continue;
			}

			lastSeqRef.current = event.seq;
			writeTerminalEvent(terminal, event);
		}
	}, [events, runId]);

	return (
		<div
			ref={containerRef}
			aria-label="Live terminal"
			className={className ? `of-terminal-pane ${className}` : "of-terminal-pane"}
			data-lease-mode={leaseMode}
		/>
	);
}

function writeTerminalEvent(terminal: XTerm, event: EventEnvelope): void {
	if ((event.type === "terminal.stdout" || event.type === "terminal.stderr") && isRecord(event.payload)) {
		const data = event.payload.data;
		if (typeof data === "string") {
			terminal.write(data);
		}
		return;
	}

	if (event.type === "terminal.open" && isRecord(event.payload)) {
		const cols = event.payload.cols;
		const rows = event.payload.rows;
		if (typeof cols === "number" && typeof rows === "number") {
			terminal.resize(cols, rows);
		}
		return;
	}

	if (event.type === "terminal.closed" && isRecord(event.payload)) {
		const exitCode = typeof event.payload.exitCode === "number" ? event.payload.exitCode : 0;
		const signal = typeof event.payload.signal === "string" ? ` (${event.payload.signal})` : "";
		terminal.write(`\r\n[process exited with code ${exitCode}${signal}]\r\n`);
	}
}

function readTerminalTheme(element: HTMLElement) {
	const styles = getComputedStyle(element);
	const cssVar = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;

	return {
		background: "#02040a",
		black: "#05070c",
		blue: cssVar("--cyan", "#35d5ff"),
		brightBlack: cssVar("--subtle", "#566174"),
		brightBlue: "#dff8ff",
		brightCyan: cssVar("--cyan", "#35d5ff"),
		brightGreen: cssVar("--green", "#55d98b"),
		brightMagenta: cssVar("--violet", "#a78bfa"),
		brightRed: cssVar("--red", "#ff6b6b"),
		brightWhite: cssVar("--foreground", "#f4f7fb"),
		brightYellow: cssVar("--amber", "#f6b84b"),
		cursor: cssVar("--cyan", "#35d5ff"),
		foreground: "#d7deea",
		green: cssVar("--green", "#55d98b"),
		magenta: cssVar("--violet", "#a78bfa"),
		red: cssVar("--red", "#ff6b6b"),
		selectionBackground: "rgba(53, 213, 255, 0.22)",
		white: "#d7deea",
		yellow: cssVar("--amber", "#f6b84b"),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
