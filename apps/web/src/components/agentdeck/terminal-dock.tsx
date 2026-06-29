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
	const structuredEvents = useMemo(
		() =>
			selectedTab
				? events
						.filter((event) => event.runId === selectedTab.runId && isStructuredAdapterEvent(event))
						.slice(-4)
				: [],
		[events, selectedTab],
	);

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
			<AgentEventCards events={structuredEvents} />
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

function AgentEventCards({ events }: { events: EventEnvelope[] }) {
	if (events.length === 0) {
		return (
			<div className="of-agent-event-strip" aria-label="Structured agent events">
				<div className="of-agent-event-empty">Structured agent events will appear here as adapters normalize output.</div>
			</div>
		);
	}

	return (
		<div className="of-agent-event-strip" aria-label="Structured agent events">
			{events.map((event) => {
				const card = adapterEventCard(event);
				return (
					<article className={`of-agent-event-card is-${card.tone}`} key={event.id}>
						<span>{card.label}</span>
						<strong>{card.title}</strong>
						<p>{card.detail}</p>
					</article>
				);
			})}
		</div>
	);
}

function isStructuredAdapterEvent(event: EventEnvelope): boolean {
	return (
		event.type === "agent.started" ||
		event.type === "agent.ended" ||
		event.type === "message.assistant_start" ||
		event.type === "message.assistant_delta" ||
		event.type === "message.assistant_end" ||
		event.type === "message.queued" ||
		event.type === "message.delivered" ||
		event.type === "tool.start" ||
		event.type === "tool.delta" ||
		event.type === "tool.end" ||
		event.type === "tool.error" ||
		event.type === "approval.requested"
	);
}

function adapterEventCard(event: EventEnvelope): {
	detail: string;
	label: string;
	title: string;
	tone: "approval" | "danger" | "info" | "success" | "tool";
} {
	const payload = isRecord(event.payload) ? event.payload : {};
	switch (event.type) {
		case "agent.started":
			return {
				detail: stringValue(payload.harnessMode) ?? "Adapter session started",
				label: "Agent",
				title: agentLabel(payload.agentKind),
				tone: "info",
			};
		case "agent.ended":
			return {
				detail: `Status ${stringValue(payload.status) ?? "completed"}`,
				label: "Agent",
				title: `${agentLabel(payload.agentKind)} finished`,
				tone: payload.status === "failed" ? "danger" : "success",
			};
		case "message.assistant_start":
			return {
				detail: stringValue(payload.messageId) ?? "Assistant response opened",
				label: "Message",
				title: `${agentLabel(payload.agentKind)} response`,
				tone: "info",
			};
		case "message.assistant_delta":
			return {
				detail: truncate(stringValue(payload.delta) ?? "Assistant updated the response."),
				label: "Message",
				title: "Assistant update",
				tone: "info",
			};
		case "message.assistant_end":
			return {
				detail: stringValue(payload.contentRef) ?? "Response finalized",
				label: "Message",
				title: "Assistant response complete",
				tone: "success",
			};
		case "message.queued":
			return {
				detail: stringValue(payload.deliveryPolicy) ?? "Queued after current turn",
				label: "Queue",
				title: "Follow-up queued",
				tone: "approval",
			};
		case "message.delivered":
			return {
				detail: stringValue(payload.messageId) ?? "Delivered to adapter",
				label: "Queue",
				title: "Message delivered",
				tone: "success",
			};
		case "tool.start":
			return {
				detail: `Risk ${stringValue(payload.risk) ?? "medium"}`,
				label: "Tool",
				title: stringValue(payload.toolName) ?? "Tool started",
				tone: "tool",
			};
		case "tool.delta":
			return {
				detail: truncate(stringValue(payload.delta) ?? "Tool output received."),
				label: "Tool",
				title: "Tool output",
				tone: "tool",
			};
		case "tool.end":
			return {
				detail: `Status ${stringValue(payload.status) ?? "success"}`,
				label: "Tool",
				title: "Tool complete",
				tone: payload.status === "error" ? "danger" : "success",
			};
		case "tool.error":
			return {
				detail: truncate(stringValue(payload.error) ?? "Tool failed."),
				label: "Tool",
				title: "Tool error",
				tone: "danger",
			};
		case "approval.requested":
			return {
				detail: `Risk ${stringValue(payload.risk) ?? "medium"}`,
				label: "Approval",
				title: stringValue(payload.title) ?? "Approval requested",
				tone: "approval",
			};
		default:
			return {
				detail: "Normalized adapter event",
				label: "Event",
				title: "Adapter event",
				tone: "info",
			};
	}
}

function agentLabel(value: unknown): string {
	if (typeof value !== "string") {
		return "Agent";
	}

	return value
		.split("-")
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(" ");
}

function truncate(value: string): string {
	return value.length > 96 ? `${value.slice(0, 93)}...` : value;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
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
