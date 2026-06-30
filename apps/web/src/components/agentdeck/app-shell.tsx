"use client";

import { Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	Bot,
	CalendarClock,
	ChevronDown,
	Files,
	GitBranch,
	MonitorCog,
	Radar,
	ShieldCheck,
	SquareStack,
	X,
} from "lucide-react";
import { getPrivacyStorageDecision } from "@agentdeck/policy";
import { transitionApprovalStatus, type ApprovalRequest, type BrowserControlMessage } from "@agentdeck/core";
import {
	useActiveRun,
	useAgentInventory,
	useDecisionReports,
	usePolicies,
	useQueueItems,
	useScheduledJobs,
	useWorkspaceSummary,
} from "@/lib/agentdeck-queries";
import { useSessionWebSocket } from "@/lib/use-session-websocket";
import { useUiStore } from "@/store/ui-store";
import {
	CandidateRow,
	ConfidenceMeter,
	graphStatusLabels,
	Metric,
	RiskBadge,
	StatusChip,
	VerificationCard,
} from "./primitives";
import { CommandPalette } from "./command-palette";
import { TerminalDock } from "./terminal-dock";
import { defaultTerminalLeaseState, deriveTerminalLeaseStates, type TerminalLeaseState } from "./terminal-lease";
import { activeRun, decisionReport, policyRules, queueItems, scheduledJobs, workspaceSummary } from "@/lib/mock-agentdeck";

const navItems = [
	{ href: "/mission-control", icon: Radar, id: "mission", label: "Mission" },
	{ href: "/sessions/session_auth_refresh", icon: SquareStack, id: "sessions", label: "Sessions" },
	{ href: "/agents", icon: Bot, id: "agents", label: "Agents" },
	{ href: "/queue", icon: GitBranch, id: "queue", label: "Queue" },
	{ href: "/schedules", icon: CalendarClock, id: "schedules", label: "Schedules" },
	{ href: "/reports", icon: Files, id: "reports", label: "Reports" },
	{ href: "/policies", icon: ShieldCheck, id: "policies", label: "Policies" },
	{ href: "/settings/machines", icon: MonitorCog, id: "machines", label: "Machines" },
];

const patchPreview = `diff --git a/src/auth/session.ts b/src/auth/session.ts
@@
-  cache.write(session);
+  if (refresh.startedAt >= cache.lastWriteAt) {
+    cache.write(session);
+  }

diff --git a/src/auth/auth-refresh.spec.ts b/src/auth/auth-refresh.spec.ts
@@
+it("ignores stale refresh writes after a retry succeeds", async () => {
+  await expect(refreshSession()).resolves.toMatchObject({ fresh: true });
+});`;

export function AppShell({ children }: { children: ReactNode }) {
	const run = activeRun;
	const workspace = workspaceSummary;
	const activeTerminalTabId = useUiStore((state) => state.activeTerminalTabId);
	const setActiveTerminalTab = useUiStore((state) => state.setActiveTerminalTab);
	const setTerminalLeaseMode = useUiStore((state) => state.setTerminalLeaseMode);
	const [localLeaseStates, setLocalLeaseStates] = useState<Record<string, TerminalLeaseState>>({});
	const sessionSocket = useSessionWebSocket(run.sessionId);
	const liveLeaseStates = useMemo(() => deriveTerminalLeaseStates(sessionSocket.events), [sessionSocket.events]);
	const selectedTerminalTabId = activeTerminalTabId ?? run.terminalTabs[0]?.id ?? "";
	const selectedTerminalTab = useMemo(
		() => run.terminalTabs.find((tab) => tab.id === selectedTerminalTabId) ?? run.terminalTabs[0],
		[run.terminalTabs, selectedTerminalTabId],
	);
	const activeLeaseState = selectedTerminalTab
		? liveLeaseStates[selectedTerminalTab.runId] ?? localLeaseStates[selectedTerminalTab.runId] ?? defaultTerminalLeaseState
		: defaultTerminalLeaseState;

	const applyLocalTerminalControl = useCallback(
		(message: BrowserControlMessage) => {
			switch (message.type) {
				case "terminal.lease.request":
					setLocalLeaseStates((current) => ({
						...current,
						[message.runId]: {
							leaseId: `local-${message.runId}`,
							mode: message.mode,
						},
					}));
					setTerminalLeaseMode(message.runId, message.mode);
					break;
				case "terminal.lease.release":
					setLocalLeaseStates((current) => ({
						...current,
						[message.runId]: defaultTerminalLeaseState,
					}));
					setTerminalLeaseMode(message.runId, "agent-control");
					break;
				default:
					break;
			}
		},
		[setTerminalLeaseMode],
	);

	const sendTerminalControl = useCallback(
		(message: BrowserControlMessage) => {
			const sent = sessionSocket.send(message);
			if (!sent) {
				applyLocalTerminalControl(message);
			}
			return sent;
		},
		[applyLocalTerminalControl, sessionSocket],
	);

	return (
		<Tooltip.Provider delayDuration={180}>
			<div className="of-shell">
				<LeftNavigation
					agentCount={run.terminalTabs.filter((tab) => tab.status !== "idle").length}
					approvalCount={run.approvals.filter((approval) => approval.status === "pending").length}
					queueCount={queueItems.length}
					reportCount={decisionReport.candidateComparison?.length ?? 0}
				/>
				<div className="of-main">
					<TopCommandBar
						costTodayUsd={workspace.costTodayUsd}
						machineCount={workspace.machineCount}
						pendingApprovals={workspace.pendingApprovals}
						privacyMode={workspace.privacyMode}
						repo={workspace.repo}
						branch={workspace.branch}
						workspaceName={workspace.name}
					/>
					<main className="of-workspace">
						<section className="of-center">{children}</section>
						<RightInspector />
					</main>
					<TerminalDock
						connected={sessionSocket.connected}
						connectionError={sessionSocket.error}
						events={sessionSocket.events}
						leaseState={activeLeaseState}
						onControl={sendTerminalControl}
						onSelectTab={setActiveTerminalTab}
						selectedTabId={selectedTerminalTabId}
						sessionId={run.sessionId}
						tabs={run.terminalTabs}
					/>
				</div>
				<CommandPalette />
				<DiffDrawer />
				<Suspense fallback={null}>
					<ApiDataWarmup />
				</Suspense>
			</div>
		</Tooltip.Provider>
	);
}

function ApiDataWarmup() {
	useActiveRun();
	useAgentInventory();
	useDecisionReports();
	usePolicies();
	useQueueItems();
	useScheduledJobs();
	useWorkspaceSummary();
	return null;
}

function LeftNavigation({
	agentCount,
	approvalCount,
	queueCount,
	reportCount,
}: {
	agentCount: number;
	approvalCount: number;
	queueCount: number;
	reportCount: number;
}) {
	const pathname = usePathname();
	const counts: Record<string, number | undefined> = {
		agents: agentCount,
		policies: approvalCount,
		queue: queueCount,
		reports: reportCount,
		schedules: scheduledJobs.length,
	};

	return (
		<aside className="of-nav" aria-label="AgentDeck navigation">
			<Link className="of-brand" href="/mission-control">
				<div className="of-brand-mark">AD</div>
				<div>
					<strong>AgentDeck</strong>
					<span>Mission Control</span>
				</div>
			</Link>
			<nav className="of-nav-items">
				{navItems.map((item) => {
					const active = isActivePath(pathname, item.href);
					return (
						<Tooltip.Root key={item.id}>
							<Tooltip.Trigger asChild>
								<Link className={active ? "of-nav-item is-active" : "of-nav-item"} href={item.href}>
									<item.icon aria-hidden="true" className="of-nav-icon" size={17} />
									<span>{item.label}</span>
									{counts[item.id] ? <small>{counts[item.id]}</small> : null}
								</Link>
							</Tooltip.Trigger>
							<Tooltip.Portal>
								<Tooltip.Content className="of-tooltip" side="right">
									{item.label}
								</Tooltip.Content>
							</Tooltip.Portal>
						</Tooltip.Root>
					);
				})}
			</nav>
			<div className="of-bridge-card">
				<span className="of-dot is-online" />
				<div>
					<strong>2 machines online</strong>
					<span>Bridge paired and streaming</span>
				</div>
			</div>
		</aside>
	);
}

function TopCommandBar({
	branch,
	costTodayUsd,
	machineCount,
	pendingApprovals,
	privacyMode,
	repo,
	workspaceName,
}: {
	branch: string;
	costTodayUsd: number;
	machineCount: number;
	pendingApprovals: number;
	privacyMode: string;
	repo: string;
	workspaceName: string;
}) {
	const commandPaletteOpen = useUiStore((state) => state.commandPaletteOpen);
	const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
	const privacyDecision = getPrivacyStorageDecision(privacyMode as "local-only" | "metadata-only" | "full-sync");

	return (
		<header className="of-command-bar">
			<div className="of-context">
				<DropdownMenu.Root>
					<DropdownMenu.Trigger asChild>
						<button className="of-select-button" type="button">
							<span>{workspaceName}</span>
							<ChevronDown aria-hidden="true" size={14} />
						</button>
					</DropdownMenu.Trigger>
					<DropdownMenu.Portal>
						<DropdownMenu.Content align="start" className="of-menu">
							<DropdownMenu.Item className="of-menu-item">AsthriX</DropdownMenu.Item>
							<DropdownMenu.Item className="of-menu-item">Personal Lab</DropdownMenu.Item>
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				</DropdownMenu.Root>
				<button className="of-select-button" type="button">
					<span>
						{repo}:{branch}
					</span>
				</button>
				<span className="of-privacy">{formatPrivacyMode(privacyMode)}</span>
				<span className="of-privacy">R2 {privacyDecision.r2}</span>
			</div>
			<button
				className={commandPaletteOpen ? "of-task-input is-open" : "of-task-input"}
				onClick={() => setCommandPaletteOpen(!commandPaletteOpen)}
				type="button"
			>
				<span>Ask agents to investigate, patch, verify, or schedule work...</span>
				<kbd>Cmd K</kbd>
			</button>
			<div className="of-top-metrics">
				<Metric label="Machines" value={machineCount.toString()} />
				<Metric label="Cost today" value={`$${costTodayUsd.toFixed(2)}`} />
				<Metric label="Approvals" tone="approval" value={pendingApprovals.toString()} />
				<div className="of-avatar" aria-label="Current user">
					V
				</div>
			</div>
		</header>
	);
}

function RightInspector() {
	const run = activeRun;
	const selectedGraphNodeId = useUiStore((state) => state.selectedGraphNodeId);
	const [approvedIds, setApprovedIds] = useState<Set<string>>(() => new Set());
	const selectedNode = run.graphNodes.find((node) => node.id === selectedGraphNodeId) ?? run.graphNodes[0];
	const pendingApprovals = run.approvals.filter((approval) => !approvedIds.has(approval.id));

	function approveRequest(approval: ApprovalRequest) {
		const transition = transitionApprovalStatus(approval.status, "approved");
		if (transition.ok) {
			setApprovedIds((current) => new Set(current).add(approval.id));
		}
	}

	return (
		<aside className="of-inspector">
			<section className="of-panel of-selected-node">
				<div className="of-panel-heading compact">
					<div>
						<h2>{selectedNode.label}</h2>
						<p>
							{graphStatusLabels[selectedNode.status]} / {selectedNode.subtitle}
						</p>
					</div>
					<StatusChip status={selectedNode.status} />
				</div>
			</section>
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
				{decisionReport.candidateComparison?.length ? (
					<div className="of-candidate-table" aria-label="Candidate comparison">
						<div className="of-candidate-head">
							<span>Candidate</span>
							<span>Score</span>
							<span>Evidence</span>
						</div>
						{decisionReport.candidateComparison.map((candidate, index) => (
							<CandidateRow candidate={candidate} key={candidate.id} rank={index + 1} />
						))}
					</div>
				) : null}
			</section>
			<section className="of-panel">
				<div className="of-panel-heading compact">
					<div>
						<h2>Verification</h2>
						<p>Deterministic evidence first</p>
					</div>
				</div>
				<div className="of-stack">
					{run.verification.map((result) => (
						<VerificationCard key={result.id} result={result} />
					))}
				</div>
			</section>
			<section className="of-panel">
				<div className="of-panel-heading compact">
					<div>
						<h2>Approvals</h2>
						<p>{pendingApprovals.length ? `${pendingApprovals.length} waiting` : "No pending gates"}</p>
					</div>
				</div>
				<div className="of-stack">
					{pendingApprovals.length ? (
						pendingApprovals.map((approval) => (
							<article className="of-approval-card" key={approval.id}>
								<div className="of-approval-top">
									<strong>{approval.title}</strong>
									<RiskBadge risk={approval.risk} />
								</div>
								<p>{approval.description}</p>
								<div className="of-approval-actions">
									<button onClick={() => approveRequest(approval)} type="button">
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
			<section className="of-panel">
				<div className="of-panel-heading compact">
					<div>
						<h2>Policy</h2>
						<p>No auto-merge by default</p>
					</div>
				</div>
				<div className="of-policy-list">
					{policyRules.slice(0, 3).map((rule) => (
						<article className={`of-policy-row is-${rule.defaultDecision}`} key={rule.id}>
							<div>
								<strong>{rule.action}</strong>
								<span>{rule.reason}</span>
							</div>
							<small>{rule.defaultDecision}</small>
						</article>
					))}
				</div>
			</section>
		</aside>
	);
}

function DiffDrawer() {
	const { content, open, title } = useUiStore((state) => state.diffDrawer);
	const setDiffDrawer = useUiStore((state) => state.setDiffDrawer);
	const reduceMotion = useReducedMotion();

	return (
		<AnimatePresence>
			{open ? (
				<motion.aside
					animate={{ opacity: 1, x: 0 }}
					className="of-diff-drawer"
					exit={{ opacity: 0, x: reduceMotion ? 0 : 24 }}
					initial={{ opacity: 0, x: reduceMotion ? 0 : 24 }}
					transition={{ duration: reduceMotion ? 0 : 0.18 }}
				>
					<div className="of-panel-heading compact">
						<div>
							<h2>{title}</h2>
							<p>Review before any human-approved apply step.</p>
						</div>
						<button aria-label="Close patch preview" className="of-icon-button" onClick={() => setDiffDrawer(false)} type="button">
							<X aria-hidden="true" size={16} />
						</button>
					</div>
					<pre>{content ?? patchPreview}</pre>
				</motion.aside>
			) : null}
		</AnimatePresence>
	);
}

function formatPrivacyMode(mode: string) {
	return mode
		.split("-")
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}

function isActivePath(pathname: string, href: string) {
	if (href === "/mission-control") {
		return pathname === "/" || pathname === href;
	}

	return pathname === href || pathname.startsWith(`${href.split("/")[1] ? `/${href.split("/")[1]}` : href}`);
}
