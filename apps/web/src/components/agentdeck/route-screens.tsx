"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
	Activity,
	BarChart3,
	Bot,
	CalendarClock,
	CheckCircle2,
	Clock3,
	ClipboardList,
	DatabaseZap,
	FileCode2,
	Files,
	GitBranch,
	HardDrive,
	LockKeyhole,
	MonitorCog,
	ShieldCheck,
	SquareStack,
	UserPlus,
	Users,
} from "lucide-react";
import type { QueueItem, RunStatus } from "@agentdeck/core";
import {
	useAgentInventory,
	useAuditTrail,
	useDecisionReports,
	useDispatchQueueItem,
	useEvalRuns,
	useObservabilityMetrics,
	usePolicies,
	useQueueItems,
	useRetentionPolicies,
	useScheduledJobs,
	useSessionDetail,
	useWorkspaceMembers,
	useWorkspaceSummary,
} from "@/lib/agentdeck-queries";
import { MachinePairingPanel } from "./machine-pairing-panel";
import { CandidateRow, Metric, RiskBadge, VerificationBadge } from "./primitives";

const queueColumns: Array<{ label: string; status: RunStatus }> = [
	{ label: "Queued", status: "queued" },
	{ label: "Waiting machine", status: "waiting-machine" },
	{ label: "Running", status: "running" },
	{ label: "Approval", status: "waiting-approval" },
	{ label: "Completed", status: "completed" },
	{ label: "Failed", status: "failed" },
];

export function ObservabilityScreen() {
	const metrics = useObservabilityMetrics();
	const evalRunQuery = useEvalRuns();
	const audit = useAuditTrail();
	const retention = useRetentionPolicies();
	const observabilityMetrics = metrics.data ?? [];
	const evalRuns = evalRunQuery.data ?? [];
	const auditTrail = audit.data ?? [];
	const retentionPolicies = retention.data ?? [];

	return (
		<div className="of-page">
			<PageHeader
				description="Metrics, trace coverage, audit evidence, eval readiness, and retention health for beta operations."
				icon={<Activity aria-hidden="true" size={20} />}
				title="Observability"
			/>
			<div className="of-observability-grid">
				{observabilityMetrics.length ? observabilityMetrics.map((metric) => (
					<article className={`of-observability-card is-${metric.status}`} key={metric.id}>
						<div>
							<span>{metric.label}</span>
							<strong>{metric.value}</strong>
							<small>{metric.changeLabel}</small>
						</div>
						<div className="of-sparkline" aria-hidden="true">
							{metric.trend.map((value, index) => (
								<i key={`${metric.id}-${index}`} style={{ height: `${Math.max(12, value)}%` }} />
							))}
						</div>
					</article>
				)) : <div className="of-empty-state">No metric snapshots recorded yet.</div>}
			</div>
			<div className="of-route-grid two">
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Trace and log coverage</h2>
							<p>Worker-originated events now persist stable trace IDs and JSON log context.</p>
						</div>
						<BarChart3 aria-hidden="true" size={18} />
					</div>
					<div className="of-observability-list">
						<div>
							<strong>run.workflow</strong>
							<span>queue item, run IDs, recommendation, cost, latency</span>
							<em>traced</em>
						</div>
						<div>
							<strong>session hub</strong>
							<span>bridge dispatch, replay, terminal lease, artifact upload</span>
							<em>json logs</em>
						</div>
						<div>
							<strong>retention cron</strong>
							<span>daily archive/delete policy pass via scheduler</span>
							<em>scheduled</em>
						</div>
					</div>
				</section>
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Eval runs</h2>
							<p>Benchmark scores from the bridge-backed harness.</p>
						</div>
						<ClipboardList aria-hidden="true" size={18} />
					</div>
					<div className="of-eval-list">
						{evalRuns.length ? evalRuns.map((run) => (
							<article className={`of-eval-row is-${run.status}`} key={run.id}>
								<div>
									<strong>{run.dataset}</strong>
									<span>
										{run.agent} / {run.latencyLabel}
									</span>
								</div>
								<b>{run.status === "queued" ? "Queued" : `${Math.round(run.score * 100)}%`}</b>
							</article>
						)) : <div className="of-empty-state">No eval runs recorded.</div>}
					</div>
				</section>
			</div>
			<div className="of-route-grid two">
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Audit trail</h2>
							<p>Approval, terminal, policy, and member actions stay queryable.</p>
						</div>
						<ShieldCheck aria-hidden="true" size={18} />
					</div>
					<div className="of-audit-list">
						{auditTrail.length ? auditTrail.map((entry) => (
							<article key={entry.id}>
								<span>{entry.timeLabel}</span>
								<div>
									<strong>{entry.action}</strong>
									<small>
										{entry.actor} / {entry.resource}
									</small>
								</div>
								<RiskBadge risk={entry.severity} />
							</article>
						)) : <div className="of-empty-state">No audit entries yet.</div>}
					</div>
				</section>
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Retention policies</h2>
							<p>R2 objects and D1 rows are archived or deleted by explicit policy.</p>
						</div>
						<DatabaseZap aria-hidden="true" size={18} />
					</div>
					<div className="of-retention-list">
						{retentionPolicies.length ? retentionPolicies.map((policy) => (
							<article className={`is-${policy.status}`} key={policy.id}>
								<div>
									<strong>{policy.resourceType}</strong>
									<span>
										{policy.action} after {policy.retentionDays} days
									</span>
								</div>
								<em>{policy.status}</em>
							</article>
						)) : <div className="of-empty-state">No retention policies configured.</div>}
					</div>
				</section>
			</div>
		</div>
	);
}

export function TeamScreen() {
	const membersQuery = useWorkspaceMembers();
	const workspaceMembers = membersQuery.data ?? [];

	return (
		<div className="of-page">
			<PageHeader
				description="Workspace roles, permission boundaries, invite state, and enterprise privacy defaults."
				icon={<Users aria-hidden="true" size={20} />}
				title="Team beta"
			/>
			<div className="of-route-grid two">
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Workspace members</h2>
							<p>Owner controls policy and machines; members operate runs; observers read audit evidence.</p>
						</div>
						<UserPlus aria-hidden="true" size={18} />
					</div>
					<div className="of-member-list">
						{workspaceMembers.length ? workspaceMembers.map((member) => (
							<article className={`is-${member.role}`} key={member.id}>
								<div className="of-member-avatar">{member.avatarLabel}</div>
								<div className="of-member-identity">
									<strong>{member.name}</strong>
									<div>
										<span>{member.email}</span>
									</div>
								</div>
								<div>
									<em>{member.role}</em>
									<small>{member.joinedLabel}</small>
								</div>
							</article>
						)) : <div className="of-empty-state">No workspace members found.</div>}
					</div>
				</section>
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Permission engine</h2>
							<p>Route handlers now authorize through the shared policy package.</p>
						</div>
					</div>
					<div className="of-permission-matrix">
						<div>
							<strong>Owner</strong>
							<span>Policies, machines, members, schedules, queue, approvals</span>
						</div>
						<div>
							<strong>Member</strong>
							<span>Sessions, terminal jump-in, approvals, queue, report export</span>
						</div>
						<div>
							<strong>Observer</strong>
							<span>Session read and audit review only</span>
						</div>
					</div>
				</section>
			</div>
			<section className="of-route-band">
				<div>
					<LockKeyhole aria-hidden="true" size={18} />
					<strong>Enterprise privacy mode</strong>
					<span>Local-only workspaces can enforce retention and provider allowlists without syncing raw terminal logs.</span>
				</div>
				<div>
					<ShieldCheck aria-hidden="true" size={18} />
					<strong>Audit-first collaboration</strong>
					<span>Approvals, terminal input, model selection, policy changes, and member actions are append-only records.</span>
				</div>
			</section>
		</div>
	);
}

export function AgentInventoryScreen() {
	const agents = useAgentInventory();
	const agentInstallations = agents.data ?? [];

	return (
		<div className="of-page">
			<PageHeader
				description="Bridge-detected adapters, auth state, latency, and best-fit routing guidance."
				icon={<Bot aria-hidden="true" size={20} />}
				title="Agent inventory"
			/>
			<div className="of-agent-grid of-agent-grid-wide">
				{agentInstallations.length ? agentInstallations.map((agent) => (
					<article className={`of-agent-card is-${agent.status}`} key={agent.id}>
						<div className="of-agent-header">
							<div className="of-agent-icon">{agent.name.slice(0, 2)}</div>
							<div>
								<strong>{agent.name}</strong>
								<span>
									{agent.command}
									{agent.version ? ` / ${agent.version}` : ""}
								</span>
							</div>
						</div>
						<p>{agent.recommendedFor}</p>
						<div className="of-chip-row">
							<span>{agent.status}</span>
							<span>{agent.authStatus}</span>
							{agent.latencyMs ? <span>{agent.latencyMs}ms</span> : null}
							<span>{agent.lastSeenLabel}</span>
						</div>
						<div className="of-chip-row">
							{agent.capabilities.map((capability) => (
								<span key={capability}>{capability}</span>
							))}
						</div>
					</article>
				)) : <div className="of-empty-state">Pair a bridge to detect installed agents.</div>}
			</div>
		</div>
	);
}

export function MachineSettingsScreen() {
	return (
		<div className="of-page">
			<PageHeader
				description="Pair local bridges, inspect machine health, and keep execution local-first."
				icon={<MonitorCog aria-hidden="true" size={20} />}
				title="Machine settings"
			/>
			<MachinePairingPanel />
			<div className="of-route-band compact">
				<div>
					<LockKeyhole aria-hidden="true" size={16} />
					<strong>Local-first</strong>
					<span>Raw terminal logs stay local unless privacy mode allows sync.</span>
				</div>
				<div>
					<ShieldCheck aria-hidden="true" size={16} />
					<strong>Human-controlled</strong>
					<span>Risky commands stay approval-gated.</span>
				</div>
			</div>
		</div>
	);
}

export function PoliciesScreen() {
	const providers = ["OpenAI", "Anthropic", "Google", "Qwen", "DeepSeek", "Ollama", "OpenRouter"];
	const workspace = useWorkspaceSummary();
	const policies = usePolicies();
	const summary = workspace.data;
	const policyRules = policies.data ?? [];

	return (
		<div className="of-page">
			<PageHeader
				description="Privacy mode, command policy, provider allowlist, and protected path defaults."
				icon={<ShieldCheck aria-hidden="true" size={20} />}
				title="Policies"
			/>
			<div className="of-route-grid two">
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Privacy mode</h2>
							<p>Current workspace: {summary?.name ?? "No workspace"}</p>
						</div>
						<span className="of-live-chip">{summary?.privacyMode ?? "unconfigured"}</span>
					</div>
					<div className="of-policy-mode-grid">
						{["local-only", "metadata-only", "full-sync"].map((mode) => (
							<article className={mode === summary?.privacyMode ? "of-policy-mode is-active" : "of-policy-mode"} key={mode}>
								<strong>{mode}</strong>
								<span>
									{mode === "local-only"
										? "No raw logs or artifacts leave the bridge."
										: mode === "metadata-only"
											? "Metadata sync with privacy-aware R2 payload decisions."
											: "Full sync for approved workspaces and artifacts."}
								</span>
							</article>
						))}
					</div>
				</section>
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Provider allowlist</h2>
							<p>Phase 10 adapters are visible but bridge execution stays separate.</p>
						</div>
					</div>
					<div className="of-provider-grid">
						{providers.map((provider) => (
							<span key={provider}>{provider}</span>
						))}
					</div>
				</section>
			</div>
			<section className="of-panel">
				<div className="of-panel-heading">
					<div>
						<h2>Command approval matrix</h2>
						<p>Policy classifier decisions are the shared source of truth.</p>
					</div>
				</div>
				<div className="of-policy-list">
					{policyRules.length ? policyRules.map((rule) => (
						<article className={`of-policy-row is-${rule.defaultDecision}`} key={rule.id}>
							<div>
								<strong>{rule.action}</strong>
								<span>{rule.reason}</span>
							</div>
							<div className="of-policy-row-actions">
								<RiskBadge risk={rule.risk} />
								<small>{rule.defaultDecision}</small>
							</div>
						</article>
					)) : <div className="of-empty-state">No policy rules configured.</div>}
				</div>
			</section>
			<section className="of-panel">
				<div className="of-panel-heading">
					<div>
						<h2>Protected paths</h2>
						<p>Edits require explicit approval before an agent can continue.</p>
					</div>
				</div>
				<div className="of-protected-paths">
					<code>.env*</code>
					<code>.github/workflows/*</code>
					<code>apps/web/wrangler.jsonc</code>
					<code>packages/db/migrations/*</code>
				</div>
			</section>
		</div>
	);
}

export function QueueScreen() {
	const queue = useQueueItems();
	const dispatch = useDispatchQueueItem();
	const items = queue.data ?? [];

	return (
		<div className="of-page">
			<PageHeader
				description="Queued runs stay isolated, cost-bounded, and approval-aware before dispatch."
				icon={<GitBranch aria-hidden="true" size={20} />}
				title="Build queue"
			/>
			<div className="of-queue-board">
				{queueColumns.map((column) => {
					const columnItems = items.filter((item) => item.status === column.status);
					return (
						<section className="of-panel of-queue-column" key={column.status}>
							<div className="of-panel-heading compact">
								<div>
									<h2>{column.label}</h2>
									<p>{columnItems.length} runs</p>
								</div>
							</div>
							<div className="of-stack">
								{columnItems.length ? (
									columnItems.map((item) => (
										<QueueCard
											dispatching={dispatch.isPending}
											item={item}
											key={item.id}
											onDispatch={() => dispatch.mutate(item.id)}
										/>
									))
								) : (
									<div className="of-empty-state">No runs.</div>
								)}
							</div>
						</section>
					);
				})}
			</div>
			<section className="of-route-band">
				<div>
					<HardDrive aria-hidden="true" size={18} />
					<strong>Worktree isolation</strong>
					<span>Every queued run dispatches to an isolated branch before terminal execution.</span>
				</div>
				<div>
					<ShieldCheck aria-hidden="true" size={18} />
					<strong>Policy waits</strong>
					<span>Queue workers stop at approval gates instead of bypassing human control.</span>
				</div>
			</section>
		</div>
	);
}

export function ReportsScreen() {
	const reportsQuery = useDecisionReports();
	const reports = reportsQuery.data ?? [];
	const report = reports[0];

	return (
		<div className="of-page">
			<PageHeader
				description="Decision reports capture candidates, evidence, synthesis, cost, and human interventions."
				icon={<Files aria-hidden="true" size={20} />}
				title="Reports"
			/>
			{report ? <section className="of-panel">
				<div className="of-panel-heading">
					<div>
						<h2>{report.summary}</h2>
						<p>{report.recommendation.replace("-", " ")}</p>
					</div>
					<Link className="of-secondary-action" href={`/reports/${report.id}`}>
						Open detail
					</Link>
				</div>
				<div className="of-report-grid wide">
					<Metric label="Agents" value={report.agentsUsed.length.toString()} />
					<Metric label="Files" value={report.filesChanged.toString()} />
					<Metric label="Commands" value={report.commandsRun.toString()} />
					<Metric label="Human input" value={report.humanInterventions.toString()} />
					<Metric label="Cost" value={`$${report.costUsd.toFixed(2)}`} />
					<Metric label="Latency" value={report.latencyLabel} />
				</div>
			</section> : <div className="of-empty-state">No decision reports yet.</div>}
			<section className="of-panel">
				<div className="of-panel-heading">
					<div>
						<h2>Candidate evidence</h2>
						<p>Verifier-aware scores ranked before synthesis.</p>
					</div>
				</div>
				<div className="of-candidate-table">
					<div className="of-candidate-head">
						<span>Candidate</span>
						<span>Score</span>
						<span>Evidence</span>
					</div>
					{report?.candidateComparison?.length ? report.candidateComparison.map((candidate, index) => (
						<CandidateRow candidate={candidate} key={candidate.id} rank={index + 1} />
					)) : <div className="of-empty-state">No candidate evidence recorded.</div>}
				</div>
			</section>
		</div>
	);
}

export function ReportDetailScreen({ reportId }: { reportId: string }) {
	const reportsQuery = useDecisionReports();
	const report = (reportsQuery.data ?? []).find((item) => item.id === reportId) ?? reportsQuery.data?.[0];

	return (
		<div className="of-page">
			<PageHeader
				description={report ? `Report ${reportId} / session ${report.sessionId}` : `Report ${reportId}`}
				icon={<FileCode2 aria-hidden="true" size={20} />}
				title="Decision report detail"
			/>
			{report ? <section className="of-panel">
				<div className="of-panel-heading">
					<div>
						<h2>Recommendation: {report.recommendation.replace("-", " ")}</h2>
						<p>{report.summary}</p>
					</div>
				</div>
				<div className="of-route-grid three">
					<Metric label="Confidence" value={`${Math.round(report.confidence * 100)}%`} />
					<Metric label="Files changed" value={report.filesChanged.toString()} />
					<Metric label="Commands" value={report.commandsRun.toString()} />
				</div>
			</section> : <div className="of-empty-state">Report not found.</div>}
			<section className="of-panel">
				<div className="of-panel-heading">
					<div>
						<h2>Verification stack</h2>
						<p>Deterministic checks attached to the winning evidence.</p>
					</div>
				</div>
				<div className="of-stack">
					<div className="of-empty-state">Open the linked session for verifier event replay.</div>
				</div>
			</section>
		</div>
	);
}

export function SchedulesScreen() {
	const schedulesQuery = useScheduledJobs();
	const scheduledJobs = schedulesQuery.data ?? [];

	return (
		<div className="of-page">
			<PageHeader
				description="Cron-backed workflows for nightly verification, dependency checks, and reports."
				icon={<CalendarClock aria-hidden="true" size={20} />}
				title="Schedules"
			/>
			<div className="of-route-grid two">
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Upcoming runs</h2>
							<p>Times are shown in the configured schedule timezone.</p>
						</div>
					</div>
					<div className="of-schedule-list standalone">
						{scheduledJobs.length ? scheduledJobs.map((job) => (
							<article className={job.enabled ? "of-schedule-row is-enabled" : "of-schedule-row"} key={job.id}>
								<div>
									<strong>{job.name}</strong>
									<span>
										{job.naturalLanguage} / {job.cron}
									</span>
								</div>
								<span>{job.nextRunLabel}</span>
							</article>
						)) : <div className="of-empty-state">No schedules configured.</div>}
					</div>
				</section>
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Schedule editor</h2>
							<p>Natural language remains stored with the normalized cron expression.</p>
						</div>
					</div>
					<div className="of-editor-grid">
						<label>
							<span>Name</span>
							<input defaultValue="Nightly regression run" />
						</label>
						<label>
							<span>Prompt</span>
							<input defaultValue="Run every weekday at 1 AM IST" />
						</label>
						<label>
							<span>Cron</span>
							<input defaultValue="0 1 * * 1-5" />
						</label>
					</div>
				</section>
			</div>
		</div>
	);
}

export function SessionDetailScreen({ sessionId }: { sessionId: string }) {
	const session = useSessionDetail(sessionId);
	const run = session.data;

	if (session.isLoading) {
		return <div className="of-empty-state">Loading session...</div>;
	}

	if (!run) {
		return <div className="of-empty-state">Session has no persisted run data yet.</div>;
	}

	return (
		<div className="of-page">
			<PageHeader
				description={`${run.title} / ${sessionId}`}
				icon={<SquareStack aria-hidden="true" size={20} />}
				title="Session detail"
			/>
			<div className="of-route-grid two">
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Session timeline</h2>
							<p>Event-sourced replay remains the audit baseline.</p>
						</div>
					</div>
					<div className="of-timeline">
						{run.timeline.map((event) => (
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
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Terminal replay</h2>
							<p>Seed transcript shown here; live PTY remains in the dock.</p>
						</div>
					</div>
					<div className="of-replay-list">
						{run.terminalTabs[0]?.lines.length ? run.terminalTabs[0].lines.map((line) => (
							<code className={`is-${line.tone ?? "default"}`} key={line.id}>
								<span>{line.timestamp}</span>
								{line.prompt ? <strong>{line.prompt}</strong> : null}
								{line.text}
							</code>
						)) : <div className="of-empty-state">Terminal output appears after dispatch.</div>}
					</div>
				</section>
			</div>
			<div className="of-route-grid two">
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Message tree</h2>
							<p>Adapter events normalize messages, tool calls, and approvals.</p>
						</div>
					</div>
					<div className="of-message-tree">
						<span>user.task</span>
						<span>router.plan</span>
						<span>bridge.dispatch</span>
						<span>verifier.result</span>
						<span>report.pending</span>
					</div>
				</section>
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Artifacts</h2>
							<p>Patch and report objects are privacy-aware R2 payloads.</p>
						</div>
					</div>
					<div className="of-artifact-list">
						{run.verification.map((result) => (
							<article key={result.id}>
								{result.status === "passed" ? <CheckCircle2 aria-hidden="true" size={16} /> : <Clock3 aria-hidden="true" size={16} />}
								<div>
									<strong>{result.label}</strong>
									<span>{result.summary}</span>
								</div>
								<VerificationBadge status={result.status} />
							</article>
						))}
					</div>
				</section>
			</div>
		</div>
	);
}

function PageHeader({ description, icon, title }: { description: string; icon: ReactNode; title: string }) {
	return (
		<header className="of-page-header">
			<div className="of-page-title-icon">{icon}</div>
			<div>
				<h1>{title}</h1>
				<p>{description}</p>
			</div>
		</header>
	);
}

function QueueCard({
	dispatching,
	item,
	onDispatch,
}: {
	dispatching: boolean;
	item: QueueItem;
	onDispatch: () => void;
}) {
	return (
		<article className="of-queue-card">
			<div>
				<strong>{item.task}</strong>
				<span>
					{item.agent} / {item.repo}:{item.branch}
				</span>
			</div>
			<div className="of-chip-row">
				<span>{item.priority}</span>
				<span>{item.estimate}</span>
			</div>
			<div className="of-queue-card-footer">
				<span>{item.scheduleWindow}</span>
				<RiskBadge risk={item.risk} />
			</div>
			{item.status === "queued" || item.status === "waiting-machine" ? (
				<button className="of-secondary-action small" disabled={dispatching} onClick={onDispatch} type="button">
					Dispatch
				</button>
			) : null}
		</article>
	);
}
