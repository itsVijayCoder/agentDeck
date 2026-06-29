"use client";

import { useCallback, useMemo } from "react";
import { classifyCommandRisk } from "@agentdeck/policy";
import { transitionTerminalLease, type BrowserControlMessage, type TerminalTab } from "@agentdeck/core";
import type { EventEnvelope, TerminalTabStatus } from "@agentdeck/core";

import { JumpInControl } from "./jump-in-control";
import { LeaseBanner } from "./lease-banner";
import { TerminalPane } from "./terminal-pane";
import type { TerminalLeaseState } from "./terminal-lease";

export function TerminalDock({
	connected,
	connectionError,
	events,
	leaseState,
	onControl,
	onSelectTab,
	selectedTabId,
	sessionId,
	tabs,
}: {
	connected: boolean;
	connectionError?: { message: string } | null;
	events: EventEnvelope[];
	leaseState: TerminalLeaseState;
	onControl: (message: BrowserControlMessage) => boolean;
	onSelectTab: (tabId: string) => void;
	selectedTabId: string;
	sessionId: string;
	tabs: TerminalTab[];
}) {
	const selectedTab = useMemo(
		() => tabs.find((tab) => tab.id === selectedTabId) ?? tabs[0],
		[selectedTabId, tabs],
	);
	const initialTranscript = useMemo(
		() => (selectedTab ? terminalTranscriptFromTab(selectedTab) : ""),
		[selectedTab],
	);
	const commandPolicy = useMemo(() => {
		const lastPromptLine = selectedTab?.lines.findLast((line) => line.prompt);
		return lastPromptLine ? classifyCommandRisk(lastPromptLine.text) : undefined;
	}, [selectedTab]);

	const requestReadOnly = useCallback(() => {
		if (!selectedTab) {
			return;
		}

		const transition = transitionTerminalLease(leaseState.mode, "read-only");
		if (!transition.ok) {
			return;
		}

		onControl({
			mode: "read-only",
			runId: selectedTab.runId,
			type: "terminal.lease.request",
		});
	}, [leaseState.mode, onControl, selectedTab]);

	const copySeedTranscript = useCallback(() => {
		if (!selectedTab || typeof navigator === "undefined" || !navigator.clipboard) {
			return;
		}

		void navigator.clipboard.writeText(selectedTab.lines.map((line) => line.text).join("\n"));
	}, [selectedTab]);

	if (!selectedTab) {
		return (
			<section className="of-terminal-dock" aria-label="Terminal dock">
				<div className="of-terminal-empty-state">No terminal sessions are attached to this run.</div>
			</section>
		);
	}

	return (
		<section className="of-terminal-dock" aria-label="Terminal dock">
			<div className="of-terminal-tabs">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						className={tab.id === selectedTab.id ? "of-terminal-tab is-active" : "of-terminal-tab"}
						type="button"
						onClick={() => onSelectTab(tab.id)}
					>
						<span>{tab.label}</span>
						<TerminalStatusDot status={tab.status} />
					</button>
				))}
			</div>
			<LeaseBanner connected={connected} mode={leaseState.mode} />
			<div className="of-terminal-toolbar">
				<div className="of-terminal-toolbar-copy">
					<span className={connected ? "of-terminal-connection is-connected" : "of-terminal-connection"}>
						{connected ? "Live PTY stream" : connectionError?.message ?? "SessionHub offline"}
					</span>
					<span>{sessionId}</span>
					{commandPolicy ? (
						<span className={`of-command-policy is-${commandPolicy.decision}`}>
							{commandPolicy.decision} / {commandPolicy.risk}
						</span>
					) : null}
				</div>
				<div className="of-terminal-controls">
					<JumpInControl leaseState={leaseState} onControl={onControl} runId={selectedTab.runId} />
					<button className="of-terminal-control" type="button" onClick={requestReadOnly}>
						Observe
					</button>
					<button className="of-terminal-control" type="button" onClick={copySeedTranscript}>
						Copy Logs
					</button>
				</div>
			</div>
			<TerminalPane
				key={selectedTab.runId}
				events={events}
				initialTranscript={initialTranscript}
				leaseMode={leaseState.mode}
				onControl={onControl}
				runId={selectedTab.runId}
			/>
		</section>
	);
}

function TerminalStatusDot({ status }: { status: TerminalTabStatus }) {
	return <span className={`of-terminal-status is-${status}`} aria-label={status} />;
}

function terminalTranscriptFromTab(tab: TerminalTab): string {
	return tab.lines.map(formatTerminalLine).join("");
}

function formatTerminalLine(line: TerminalTab["lines"][number]): string {
	const tone = ansiTone(line.tone);
	const prompt = line.prompt ? `${line.prompt} ` : "";
	const timestamp = `\x1b[90m${line.timestamp}\x1b[0m`;
	return `${timestamp} ${tone}${prompt}${line.text}\x1b[0m\r\n`;
}

function ansiTone(tone: TerminalTab["lines"][number]["tone"]): string {
	switch (tone) {
		case "danger":
			return "\x1b[31m";
		case "info":
			return "\x1b[36m";
		case "muted":
			return "\x1b[90m";
		case "success":
			return "\x1b[32m";
		case "warning":
			return "\x1b[33m";
		default:
			return "";
	}
}
