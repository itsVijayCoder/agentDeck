"use client";

import { useMemo, useState } from "react";
import { classifyCommandRisk, getPrivacyStorageDecision } from "@/lib/openfusion-policy";
import { deriveRunProgress, transitionApprovalStatus, transitionTerminalLease } from "@/lib/openfusion-state";
import {
	activeRun,
	agentInstallations,
	decisionReport,
	navigationItems,
	policyRules,
	queueItems,
	scheduledJobs,
	workspaceSummary,
} from "@/lib/mock-openfusion";
import type {
	AgentGraphNode,
	AgentInstallation,
	ApprovalRequest,
	GraphNodeStatus,
	PolicyRule,
	QueueItem,
	RiskLevel,
	ScheduledJob,
	TerminalLeaseMode,
	TerminalTab,
	TerminalTabStatus,
	VerificationResult,
	VerificationStatus,
} from "@/types/openfusion";

const statusLabels: Record<GraphNodeStatus, string> = {
	complete: "Complete",
	running: "Running",
	waiting: "Waiting",
	blocked: "Blocked",
	idle: "Idle",
};

const leaseLabels: Record<TerminalLeaseMode, string> = {
	"agent-control": "Agent has control",
	"human-control": "You are controlling this terminal",
	"read-only": "Read-only observer",
};

export function MissionControlDashboard() {
	const [selectedNav, setSelectedNav] = useState("mission");
	const [selectedNodeId, setSelectedNodeId] = useState("claude");
	const [terminalTabId, setTerminalTabId] = useState("claude");
	const [leaseMode, setLeaseMode] = useState<TerminalLeaseMode>("agent-control");
	const [approvedIds, setApprovedIds] = useState<Set<string>>(() => new Set());
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
	const runProgress = deriveRunProgress(activeRun.status);

	const selectedNode = useMemo(
		() => activeRun.graphNodes.find((node) => node.id === selectedNodeId) ?? activeRun.graphNodes[0],
		[selectedNodeId],
	);

	const terminalTab = useMemo(
		() => activeRun.terminalTabs.find((tab) => tab.id === terminalTabId) ?? activeRun.terminalTabs[0],
		[terminalTabId],
	);

	const pendingApprovals = activeRun.approvals.filter((approval) => !approvedIds.has(approval.id));
	const privacyDecision = getPrivacyStorageDecision(workspaceSummary.privacyMode);

	function requestLeaseMode(mode: TerminalLeaseMode) {
		const transition = transitionTerminalLease(leaseMode, mode);
		if (transition.ok) setLeaseMode(mode);
	}

	function approveRequest(approvalId: string) {
		const approval = activeRun.approvals.find((item) => item.id === approvalId);
		if (!approval) return;

		const transition = transitionApprovalStatus(approval.status, "approved");
		if (transition.ok) {
			setApprovedIds((current) => new Set(current).add(approvalId));
		}
	}

	return (
		<div className="of-shell">
			<LeftNavigation selectedNav={selectedNav} onSelectNav={setSelectedNav} />
			<div className="of-main">
				<TopCommandBar
					commandPaletteOpen={commandPaletteOpen}
					privacyModeLabel={formatPrivacyMode(workspaceSummary.privacyMode)}
					privacyStorageLabel={privacyDecision.r2}
					onToggleCommandPalette={() => setCommandPaletteOpen((isOpen) => !isOpen)}
				/>
				<main className="of-workspace">
					<section className="of-center">
						<ActiveRunHeader leaseMode={leaseMode} progress={runProgress} onLeaseModeChange={requestLeaseMode} />
						<MissionCanvas selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
						<div className="of-lower-grid">
							<RunTimeline />
							<AgentInventory />
						</div>
					</section>
					<RightInspector
						selectedNode={selectedNode}
						approvals={pendingApprovals}
						onApprove={approveRequest}
					/>
				</main>
				<TerminalDock
					selectedTab={terminalTab}
					selectedTabId={terminalTabId}
					leaseMode={leaseMode}
					onSelectTab={setTerminalTabId}
					onLeaseModeChange={requestLeaseMode}
				/>
			</div>
			{commandPaletteOpen ? <CommandPalette onClose={() => setCommandPaletteOpen(false)} /> : null}
		</div>
	);
}

function LeftNavigation({
	selectedNav,
	onSelectNav,
}: {
	selectedNav: string;
	onSelectNav: (navId: string) => void;
}) {
	return (
		<aside className="of-nav" aria-label="OpenFusion navigation">
			<div className="of-brand">
				<div className="of-brand-mark">OF</div>
				<div>
					<strong>OpenFusion</strong>
					<span>Mission Control</span>
				</div>
			</div>
			<nav className="of-nav-items">
				{navigationItems.map((item) => (
					<button
						key={item.id}
						className={item.id === selectedNav ? "of-nav-item is-active" : "of-nav-item"}
						type="button"
						onClick={() => onSelectNav(item.id)}
					>
						<span>{item.label}</span>
						{item.count ? <small>{item.count}</small> : null}
					</button>
				))}
			</nav>
			<div className="of-bridge-card">
				<span className="of-dot is-online" />
				<div>
					<strong>{workspaceSummary.machineCount} machines online</strong>
					<span>Bridge paired and streaming</span>
				</div>
			</div>
		</aside>
	);
}

function TopCommandBar({
	commandPaletteOpen,
	privacyModeLabel,
	privacyStorageLabel,
	onToggleCommandPalette,
}: {
	commandPaletteOpen: boolean;
	privacyModeLabel: string;
	privacyStorageLabel: string;
	onToggleCommandPalette: () => void;
}) {
	return (
		<header className="of-command-bar">
			<div className="of-context">
				<button className="of-select-button" type="button">
					{workspaceSummary.name}
				</button>
				<button className="of-select-button" type="button">
					{workspaceSummary.repo}:{workspaceSummary.branch}
				</button>
				<span className="of-privacy">{privacyModeLabel}</span>
				<span className="of-privacy">R2 {privacyStorageLabel}</span>
			</div>
			<button
				className={commandPaletteOpen ? "of-task-input is-open" : "of-task-input"}
				type="button"
				onClick={onToggleCommandPalette}
			>
				<span>Ask agents to investigate, patch, verify, or schedule work...</span>
				<kbd>Cmd K</kbd>
			</button>
			<div className="of-top-metrics">
				<Metric label="Cost today" value={`$${workspaceSummary.costTodayUsd.toFixed(2)}`} />
				<Metric label="Approvals" value={workspaceSummary.pendingApprovals.toString()} tone="approval" />
				<div className="of-avatar" aria-label="Current user">
					V
				</div>
			</div>
		</header>
	);
}

function ActiveRunHeader({
	leaseMode,
	progress,
	onLeaseModeChange,
}: {
	leaseMode: TerminalLeaseMode;
	progress: number;
	onLeaseModeChange: (mode: TerminalLeaseMode) => void;
}) {
	return (
		<section className="of-hero-panel">
			<div className="of-hero-copy">
				<div className="of-run-state">
					<span className="of-dot is-running" />
					<span>Running in isolated worktree</span>
				</div>
				<h1>{activeRun.title}</h1>
				<p>{activeRun.task}</p>
				<div className="of-run-meta">
					<span>{activeRun.worktreeLabel}</span>
					<span>{activeRun.branchName}</span>
					<RiskBadge risk={activeRun.risk} />
				</div>
				<div className="of-run-progress" aria-label={`Run progress ${progress} percent`}>
					<span style={{ width: `${progress}%` }} />
				</div>
			</div>
			<div className="of-hero-actions" aria-label="Run controls">
				<div className="of-lease-banner">{leaseLabels[leaseMode]}</div>
				<div className="of-action-row">
					<button className="of-primary-action" type="button" onClick={() => onLeaseModeChange("human-control")}>
						Jump In
					</button>
					<button className="of-secondary-action" type="button" onClick={() => onLeaseModeChange("agent-control")}>
						Pause Agent
					</button>
					<button className="of-secondary-action" type="button">
						Queue Follow-up
					</button>
					<button className="of-secondary-action" type="button">
						View Patch
					</button>
				</div>
			</div>
		</section>
	);
}

function MissionCanvas({
	selectedNodeId,
	onSelectNode,
}: {
	selectedNodeId: string;
	onSelectNode: (nodeId: string) => void;
}) {
	return (
		<section className="of-panel of-mission-canvas" aria-label="Agent orchestration graph">
			<div className="of-panel-heading">
				<div>
					<h2>Live orchestration</h2>
					<p>Task routing, candidate execution, verification, judging, and human review.</p>
				</div>
				<span className="of-live-chip">Live event stream</span>
			</div>
			<div className="of-graph">
				<svg className="of-graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
					{activeRun.graphEdges.map((edge) => {
						const from = activeRun.graphNodes.find((node) => node.id === edge.from);
						const to = activeRun.graphNodes.find((node) => node.id === edge.to);
						if (!from || !to) return null;
						return (
							<line
								key={edge.id}
								className={`of-graph-edge is-${edge.status}`}
								x1={from.x}
								x2={to.x}
								y1={from.y}
								y2={to.y}
							/>
						);
					})}
				</svg>
				{activeRun.graphNodes.map((node) => (
					<button
						key={node.id}
						className={node.id === selectedNodeId ? `of-graph-node is-${node.status} is-selected` : `of-graph-node is-${node.status}`}
						style={{ left: `${node.x}%`, top: `${node.y}%` }}
						type="button"
						onClick={() => onSelectNode(node.id)}
					>
						<span className="of-node-status" />
						<strong>{node.label}</strong>
						<small>{node.subtitle}</small>
						<em>{node.metric}</em>
					</button>
				))}
			</div>
		</section>
	);
}

function RightInspector({
	selectedNode,
	approvals,
	onApprove,
}: {
	selectedNode: AgentGraphNode;
	approvals: ApprovalRequest[];
	onApprove: (approvalId: string) => void;
}) {
	return (
		<aside className="of-inspector">
			<section className="of-panel of-selected-node">
				<div className="of-panel-heading compact">
					<div>
						<h2>{selectedNode.label}</h2>
						<p>{statusLabels[selectedNode.status]} / {selectedNode.subtitle}</p>
					</div>
					<StatusChip status={selectedNode.status} />
				</div>
			</section>
			<DecisionReportPanel />
			<VerificationStack />
			<ApprovalQueue approvals={approvals} onApprove={onApprove} />
			<QueueAndSchedules />
			<PolicyMatrix />
		</aside>
	);
}

function DecisionReportPanel() {
	return (
		<section className="of-panel">
			<div className="of-panel-heading compact">
				<div>
					<h2>Decision report</h2>
					<p>{decisionReport.recommendation.replace("-", " ")}</p>
				</div>
				<ConfidenceMeter value={decisionReport.confidence} />
			</div>
			<p className="of-report-summary">{decisionReport.summary}</p>
			<div className="of-report-grid">
				<Metric label="Agents" value={decisionReport.agentsUsed.length.toString()} />
				<Metric label="Files" value={decisionReport.filesChanged.toString()} />
				<Metric label="Commands" value={decisionReport.commandsRun.toString()} />
				<Metric label="Human input" value={decisionReport.humanInterventions.toString()} />
			</div>
		</section>
	);
}

function VerificationStack() {
	return (
		<section className="of-panel">
			<div className="of-panel-heading compact">
				<div>
					<h2>Verification</h2>
					<p>Deterministic evidence first</p>
				</div>
			</div>
			<div className="of-stack">
				{activeRun.verification.map((result) => (
					<VerificationCard key={result.id} result={result} />
				))}
			</div>
		</section>
	);
}

function VerificationCard({ result }: { result: VerificationResult }) {
	return (
		<article className={`of-verification-card is-${result.status}`}>
			<div>
				<strong>{result.label}</strong>
				<code>{result.command}</code>
			</div>
			<span>{result.durationLabel}</span>
			<p>{result.summary}</p>
		</article>
	);
}

function ApprovalQueue({
	approvals,
	onApprove,
}: {
	approvals: ApprovalRequest[];
	onApprove: (approvalId: string) => void;
}) {
	return (
		<section className="of-panel">
			<div className="of-panel-heading compact">
				<div>
					<h2>Approvals</h2>
					<p>{approvals.length ? `${approvals.length} waiting` : "No pending gates"}</p>
				</div>
			</div>
			<div className="of-stack">
				{approvals.length ? (
					approvals.map((approval) => (
						<article className="of-approval-card" key={approval.id}>
							<div className="of-approval-top">
								<strong>{approval.title}</strong>
								<RiskBadge risk={approval.risk} />
							</div>
							<p>{approval.description}</p>
							<div className="of-approval-actions">
								<button type="button" onClick={() => onApprove(approval.id)}>
									Approve once
								</button>
								<button type="button">Reject</button>
								<button type="button">Details</button>
							</div>
						</article>
					))
				) : (
					<div className="of-empty-state">Risk gates are clear. New requests will appear here.</div>
				)}
			</div>
		</section>
	);
}

function RunTimeline() {
	return (
		<section className="of-panel of-timeline-panel">
			<div className="of-panel-heading">
				<div>
					<h2>Run timeline</h2>
					<p>Event-sourced replay from bridge, agents, verifiers, and workers.</p>
				</div>
			</div>
			<div className="of-timeline">
				{activeRun.timeline.map((event) => (
					<article className={`of-timeline-event is-${event.status}`} key={event.id}>
						<span>{event.timeLabel}</span>
						<div>
							<strong>{event.title}</strong>
							<p>{event.description}</p>
							<small>{event.source}</small>
						</div>
					</article>
				))}
			</div>
		</section>
	);
}

function AgentInventory() {
	return (
		<section className="of-panel of-agents-panel">
			<div className="of-panel-heading">
				<div>
					<h2>Agent inventory</h2>
					<p>Detected locally by the bridge without reading secrets.</p>
				</div>
				<button className="of-secondary-action small" type="button">
					Re-probe
				</button>
			</div>
			<div className="of-agent-grid">
				{agentInstallations.map((agent) => (
					<AgentCard key={agent.id} agent={agent} />
				))}
			</div>
		</section>
	);
}

function AgentCard({ agent }: { agent: AgentInstallation }) {
	return (
		<article className={`of-agent-card is-${agent.status}`}>
			<div className="of-agent-header">
				<div className="of-agent-icon">{agent.name.slice(0, 2)}</div>
				<div>
					<strong>{agent.name}</strong>
					<span>{agent.command}{agent.version ? ` / ${agent.version}` : ""}</span>
				</div>
			</div>
			<p>{agent.recommendedFor}</p>
			<div className="of-chip-row">
				{agent.capabilities.slice(0, 4).map((capability) => (
					<span key={capability}>{capability}</span>
				))}
			</div>
		</article>
	);
}

function QueueAndSchedules() {
	return (
		<section className="of-panel">
			<div className="of-panel-heading compact">
				<div>
					<h2>Queue & schedules</h2>
					<p>Overnight work stays isolated</p>
				</div>
			</div>
			<div className="of-compact-list">
				{queueItems.map((item) => (
					<QueueRow key={item.id} item={item} />
				))}
			</div>
			<div className="of-schedule-list">
				{scheduledJobs.map((job) => (
					<ScheduleRow key={job.id} job={job} />
				))}
			</div>
		</section>
	);
}

function QueueRow({ item }: { item: QueueItem }) {
	return (
		<article className="of-queue-row">
			<div>
				<strong>{item.task}</strong>
				<span>{item.agent} / {item.scheduleWindow}</span>
			</div>
			<RiskBadge risk={item.risk} />
		</article>
	);
}

function ScheduleRow({ job }: { job: ScheduledJob }) {
	return (
		<article className={job.enabled ? "of-schedule-row is-enabled" : "of-schedule-row"}>
			<div>
				<strong>{job.name}</strong>
				<span>{job.cron} / {job.nextRunLabel}</span>
			</div>
			<span>{job.enabled ? "On" : "Off"}</span>
		</article>
	);
}

function PolicyMatrix() {
	return (
		<section className="of-panel">
			<div className="of-panel-heading compact">
				<div>
					<h2>Policy</h2>
					<p>No auto-merge by default</p>
				</div>
			</div>
			<div className="of-policy-list">
				{policyRules.map((rule) => (
					<PolicyRow key={rule.id} rule={rule} />
				))}
			</div>
		</section>
	);
}

function PolicyRow({ rule }: { rule: PolicyRule }) {
	return (
		<article className={`of-policy-row is-${rule.defaultDecision}`}>
			<div>
				<strong>{rule.action}</strong>
				<span>{rule.reason}</span>
			</div>
			<small>{rule.defaultDecision}</small>
		</article>
	);
}

function TerminalDock({
	selectedTab,
	selectedTabId,
	leaseMode,
	onSelectTab,
	onLeaseModeChange,
}: {
	selectedTab: TerminalTab;
	selectedTabId: string;
	leaseMode: TerminalLeaseMode;
	onSelectTab: (tabId: string) => void;
	onLeaseModeChange: (mode: TerminalLeaseMode) => void;
}) {
	const commandPolicy = useMemo(() => {
		const lastPromptLine = selectedTab.lines.findLast((line) => line.prompt);
		return lastPromptLine ? classifyCommandRisk(lastPromptLine.text) : undefined;
	}, [selectedTab]);

	return (
		<section className="of-terminal-dock" aria-label="Terminal dock">
			<div className="of-terminal-tabs">
				{activeRun.terminalTabs.map((tab) => (
					<button
						key={tab.id}
						className={tab.id === selectedTabId ? "of-terminal-tab is-active" : "of-terminal-tab"}
						type="button"
						onClick={() => onSelectTab(tab.id)}
					>
						<span>{tab.label}</span>
						<TerminalStatusDot status={tab.status} />
					</button>
				))}
			</div>
			<div className="of-terminal-toolbar">
				<div className="of-terminal-toolbar-copy">
					<span>{leaseLabels[leaseMode]}</span>
					{commandPolicy ? (
						<span className={`of-command-policy is-${commandPolicy.decision}`}>
							{commandPolicy.decision} / {commandPolicy.risk}
						</span>
					) : null}
				</div>
				<div>
					<button type="button" onClick={() => onLeaseModeChange("human-control")}>
						Jump In
					</button>
					<button type="button" onClick={() => onLeaseModeChange("agent-control")}>
						Release
					</button>
					<button type="button" onClick={() => onLeaseModeChange("read-only")}>
						Read Only
					</button>
					<button type="button">Copy Logs</button>
				</div>
			</div>
			<div className="of-terminal-pane">
				{selectedTab.lines.map((line) => (
					<div className={`of-terminal-line is-${line.tone ?? "default"}`} key={line.id}>
						<span>{line.timestamp}</span>
						{line.prompt ? <strong>{line.prompt}</strong> : null}
						<code>{line.text}</code>
					</div>
				))}
				<div className="of-terminal-cursor" />
			</div>
		</section>
	);
}

function CommandPalette({ onClose }: { onClose: () => void }) {
	return (
		<div className="of-command-overlay" role="dialog" aria-modal="true" aria-label="Command palette">
			<div className="of-command-palette">
				<div className="of-command-input">
					<span>Cmd K</span>
					<input autoFocus placeholder="Run agent task, open report, schedule verifier..." />
					<button type="button" onClick={onClose} aria-label="Close command palette">
						Esc
					</button>
				</div>
				<div className="of-command-results">
					<button type="button">Start a multi-agent run in an isolated worktree</button>
					<button type="button">Queue follow-up after current verifier completes</button>
					<button type="button">Open policy matrix for protected paths</button>
					<button type="button">Export current decision report as Markdown</button>
				</div>
			</div>
		</div>
	);
}

function ConfidenceMeter({ value }: { value: number }) {
	return (
		<div className="of-confidence" aria-label={`Confidence ${Math.round(value * 100)} percent`}>
			<svg viewBox="0 0 42 42">
				<circle cx="21" cy="21" r="16" />
				<circle cx="21" cy="21" r="16" style={{ strokeDasharray: `${value * 100} 100` }} />
			</svg>
			<strong>{Math.round(value * 100)}%</strong>
		</div>
	);
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "approval" }) {
	return (
		<div className={tone ? `of-metric is-${tone}` : "of-metric"}>
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function RiskBadge({ risk }: { risk: RiskLevel }) {
	return <span className={`of-risk is-${risk}`}>{risk}</span>;
}

function StatusChip({ status }: { status: GraphNodeStatus }) {
	return <span className={`of-status-chip is-${status}`}>{statusLabels[status]}</span>;
}

function TerminalStatusDot({ status }: { status: TerminalTabStatus }) {
	return <span className={`of-terminal-status is-${status}`} aria-label={status} />;
}

function formatPrivacyMode(mode: string) {
	return mode
		.split("-")
		.map((part) => part[0].toUpperCase() + part.slice(1))
		.join(" ");
}
