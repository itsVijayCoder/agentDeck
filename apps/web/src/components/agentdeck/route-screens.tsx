import Link from "next/link";
import type { ReactNode } from "react";
import {
	Bot,
	CalendarClock,
	CheckCircle2,
	Clock3,
	FileCode2,
	Files,
	GitBranch,
	HardDrive,
	LockKeyhole,
	MonitorCog,
	ShieldCheck,
	SquareStack,
	Terminal,
} from "lucide-react";
import type { QueueItem, RunStatus } from "@agentdeck/core";
import {
	activeRun,
	agentInstallations,
	decisionReport,
	policyRules,
	queueItems,
	scheduledJobs,
	workspaceSummary,
} from "@/lib/mock-agentdeck";
import { CandidateRow, Metric, RiskBadge, VerificationBadge, VerificationCard } from "./primitives";

const queueColumns: Array<{ label: string; status: RunStatus }> = [
	{ label: "Queued", status: "queued" },
	{ label: "Waiting machine", status: "waiting-machine" },
	{ label: "Running", status: "running" },
	{ label: "Approval", status: "waiting-approval" },
	{ label: "Completed", status: "completed" },
	{ label: "Failed", status: "failed" },
];

export function AgentInventoryScreen() {
	return (
		<div className="of-page">
			<PageHeader
				description="Bridge-detected adapters, auth state, latency, and best-fit routing guidance."
				icon={<Bot aria-hidden="true" size={20} />}
				title="Agent inventory"
			/>
			<div className="of-agent-grid of-agent-grid-wide">
				{agentInstallations.map((agent) => (
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
				))}
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
			<section className="of-empty-pairing">
				<div className="of-empty-pairing-icon">
					<Terminal aria-hidden="true" size={26} />
				</div>
				<h2>Pair your local machine</h2>
				<p>A local bridge is required before AgentDeck can detect terminal agents or execute worktree jobs.</p>
				<code>pnpm bridge pair ASTX-7429</code>
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
			</section>
		</div>
	);
}

export function PoliciesScreen() {
	const providers = ["OpenAI", "Anthropic", "Google", "Qwen", "DeepSeek", "Ollama", "OpenRouter"];

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
							<p>Current workspace: {workspaceSummary.name}</p>
						</div>
						<span className="of-live-chip">{workspaceSummary.privacyMode}</span>
					</div>
					<div className="of-policy-mode-grid">
						{["local-only", "metadata-only", "full-sync"].map((mode) => (
							<article className={mode === workspaceSummary.privacyMode ? "of-policy-mode is-active" : "of-policy-mode"} key={mode}>
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
					{policyRules.map((rule) => (
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
					))}
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
	return (
		<div className="of-page">
			<PageHeader
				description="Queued runs stay isolated, cost-bounded, and approval-aware before dispatch."
				icon={<GitBranch aria-hidden="true" size={20} />}
				title="Build queue"
			/>
			<div className="of-queue-board">
				{queueColumns.map((column) => {
					const items = queueItems.filter((item) => item.status === column.status);
					return (
						<section className="of-panel of-queue-column" key={column.status}>
							<div className="of-panel-heading compact">
								<div>
									<h2>{column.label}</h2>
									<p>{items.length} runs</p>
								</div>
							</div>
							<div className="of-stack">
								{items.length ? items.map((item) => <QueueCard item={item} key={item.id} />) : <div className="of-empty-state">No runs.</div>}
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
	return (
		<div className="of-page">
			<PageHeader
				description="Decision reports capture candidates, evidence, synthesis, cost, and human interventions."
				icon={<Files aria-hidden="true" size={20} />}
				title="Reports"
			/>
			<section className="of-panel">
				<div className="of-panel-heading">
					<div>
						<h2>{decisionReport.summary}</h2>
						<p>{decisionReport.recommendation.replace("-", " ")}</p>
					</div>
					<Link className="of-secondary-action" href={`/reports/${decisionReport.id}`}>
						Open detail
					</Link>
				</div>
				<div className="of-report-grid wide">
					<Metric label="Agents" value={decisionReport.agentsUsed.length.toString()} />
					<Metric label="Files" value={decisionReport.filesChanged.toString()} />
					<Metric label="Commands" value={decisionReport.commandsRun.toString()} />
					<Metric label="Human input" value={decisionReport.humanInterventions.toString()} />
					<Metric label="Cost" value={`$${decisionReport.costUsd.toFixed(2)}`} />
					<Metric label="Latency" value={decisionReport.latencyLabel} />
				</div>
			</section>
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
					{decisionReport.candidateComparison?.map((candidate, index) => (
						<CandidateRow candidate={candidate} key={candidate.id} rank={index + 1} />
					))}
				</div>
			</section>
		</div>
	);
}

export function ReportDetailScreen({ reportId }: { reportId: string }) {
	return (
		<div className="of-page">
			<PageHeader
				description={`Report ${reportId} / session ${decisionReport.sessionId}`}
				icon={<FileCode2 aria-hidden="true" size={20} />}
				title="Decision report detail"
			/>
			<section className="of-panel">
				<div className="of-panel-heading">
					<div>
						<h2>Recommendation: {decisionReport.recommendation.replace("-", " ")}</h2>
						<p>{decisionReport.summary}</p>
					</div>
				</div>
				<div className="of-route-grid three">
					<Metric label="Confidence" value={`${Math.round(decisionReport.confidence * 100)}%`} />
					<Metric label="Files changed" value={decisionReport.filesChanged.toString()} />
					<Metric label="Commands" value={decisionReport.commandsRun.toString()} />
				</div>
			</section>
			<section className="of-panel">
				<div className="of-panel-heading">
					<div>
						<h2>Verification stack</h2>
						<p>Deterministic checks attached to the winning evidence.</p>
					</div>
				</div>
				<div className="of-stack">
					{activeRun.verification.map((result) => (
						<VerificationCard key={result.id} result={result} />
					))}
				</div>
			</section>
		</div>
	);
}

export function SchedulesScreen() {
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
						{scheduledJobs.map((job) => (
							<article className={job.enabled ? "of-schedule-row is-enabled" : "of-schedule-row"} key={job.id}>
								<div>
									<strong>{job.name}</strong>
									<span>
										{job.naturalLanguage} / {job.cron}
									</span>
								</div>
								<span>{job.nextRunLabel}</span>
							</article>
						))}
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
	return (
		<div className="of-page">
			<PageHeader
				description={`${activeRun.title} / ${sessionId}`}
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
				<section className="of-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Terminal replay</h2>
							<p>Seed transcript shown here; live PTY remains in the dock.</p>
						</div>
					</div>
					<div className="of-replay-list">
						{activeRun.terminalTabs[0]?.lines.map((line) => (
							<code className={`is-${line.tone ?? "default"}`} key={line.id}>
								<span>{line.timestamp}</span>
								{line.prompt ? <strong>{line.prompt}</strong> : null}
								{line.text}
							</code>
						))}
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
						<span>claude.tool.start</span>
						<span>verifier.result</span>
						<span>judge.pending</span>
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
						<article>
							<CheckCircle2 aria-hidden="true" size={16} />
							<div>
								<strong>candidate-a.patch</strong>
								<span>OpenCode / verification passed</span>
							</div>
							<VerificationBadge status="passed" />
						</article>
						<article>
							<Clock3 aria-hidden="true" size={16} />
							<div>
								<strong>decision-report.md</strong>
								<span>Synthesis still collecting evidence</span>
							</div>
							<VerificationBadge status="warning" />
						</article>
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

function QueueCard({ item }: { item: QueueItem }) {
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
		</article>
	);
}
