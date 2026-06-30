"use client";

import Link from "next/link";
import { deriveRunProgress } from "@agentdeck/core";
import { ArrowUpRight, Clock3, GitBranch, ShieldAlert } from "lucide-react";
import { useUiStore } from "@/store/ui-store";
import { AgentFlowGraph } from "./agent-flow-graph";
import { CandidateRow, Metric, RiskBadge } from "./primitives";
import { useActiveRun, useDecisionReports } from "@/lib/agentdeck-queries";

const patchPreview = `diff --git a/src/auth/session.ts b/src/auth/session.ts
@@
-  cache.write(session);
+  if (refresh.startedAt >= cache.lastWriteAt) {
+    cache.write(session);
+  }`;

export function MissionControlScreen() {
	const activeRunQuery = useActiveRun();
	const reportsQuery = useDecisionReports();
	const run = activeRunQuery.data;
	const decisionReport = reportsQuery.data?.[0];
	const selectedGraphNodeId = useUiStore((state) => state.selectedGraphNodeId) ?? run?.graphNodes[0]?.id ?? "task";
	const setSelectedGraphNode = useUiStore((state) => state.setSelectedGraphNode);
	const setDiffDrawer = useUiStore((state) => state.setDiffDrawer);
	const setActiveTerminalTab = useUiStore((state) => state.setActiveTerminalTab);
	if (activeRunQuery.isLoading) {
		return <div className="of-empty-state">Loading mission state...</div>;
	}

	if (!run) {
		return (
			<div className="of-page">
				<section className="of-hero-panel">
					<div className="of-hero-copy">
						<div className="of-run-state">
							<span className="of-dot" />
							<span>No active local run</span>
						</div>
						<h1>Start a real agent task</h1>
						<p>Use the command bar to create a task, pair a bridge, dispatch it, and watch live terminal evidence here.</p>
					</div>
				</section>
			</div>
		);
	}

	const progress = deriveRunProgress(run.status);

	return (
		<div className="of-page">
			<section className="of-hero-panel">
				<div className="of-hero-copy">
					<div className="of-run-state">
						<span className="of-dot is-running" />
						<span>Running in isolated worktree</span>
					</div>
					<h1>{run.title}</h1>
					<p>{run.task}</p>
					<div className="of-run-meta">
						<span>
							<GitBranch aria-hidden="true" size={13} /> {run.worktreeLabel}
						</span>
						<span>{run.branchName}</span>
						<RiskBadge risk={run.risk} />
					</div>
					<div className="of-run-progress" aria-label={`Run progress ${progress} percent`}>
						<span style={{ width: `${progress}%` }} />
					</div>
				</div>
				<div className="of-hero-actions" aria-label="Run controls">
					<div className="of-lease-banner">
						<span>{run.agentControlLabel}</span>
						<small>No auto-merge. Human approval remains required.</small>
						<em>{run.latencyLabel}</em>
					</div>
					<div className="of-action-row">
						<button className="of-primary-action" onClick={() => setActiveTerminalTab("claude")} type="button">
							Jump In
						</button>
						<button className="of-secondary-action" onClick={() => setDiffDrawer(true, patchPreview, "Candidate patch")} type="button">
							View Patch
						</button>
						{decisionReport ? <Link className="of-secondary-action" href={`/reports/${decisionReport.id}`}>
							Open Report
							<ArrowUpRight aria-hidden="true" size={13} />
						</Link> : null}
					</div>
				</div>
			</section>

			<section className="of-panel of-mission-canvas" aria-label="Agent orchestration graph">
				<div className="of-panel-heading">
					<div>
						<h2>Live orchestration</h2>
						<p>Task routing, candidate execution, verification, judging, and human review.</p>
					</div>
					<span className="of-live-chip">React Flow</span>
				</div>
				<AgentFlowGraph onSelectNode={setSelectedGraphNode} run={run} selectedNodeId={selectedGraphNodeId} />
			</section>

			<div className="of-lower-grid">
				<section className="of-panel of-timeline-panel">
					<div className="of-panel-heading">
						<div>
							<h2>Run timeline</h2>
							<p>Event-sourced replay from bridge, agents, verifiers, and workers.</p>
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
							<h2>Candidate comparison</h2>
							<p>Verifier-aware scoring before synthesis or human review.</p>
						</div>
						<div className="of-route-metrics">
							<Metric label="Cost" value={`$${run.costUsd.toFixed(2)}`} />
							<Metric label="Confidence" value={`${Math.round(run.confidence * 100)}%`} />
						</div>
					</div>
					<div className="of-candidate-table" aria-label="Candidate comparison">
						<div className="of-candidate-head">
							<span>Candidate</span>
							<span>Score</span>
							<span>Evidence</span>
						</div>
						{decisionReport?.candidateComparison?.length ? decisionReport.candidateComparison.map((candidate, index) => (
							<CandidateRow candidate={candidate} key={candidate.id} rank={index + 1} />
						)) : <div className="of-empty-state">Candidate evidence appears after a run completes.</div>}
					</div>
				</section>
			</div>

			<section className="of-route-band" aria-label="Control guarantees">
				<div>
					<ShieldAlert aria-hidden="true" size={18} />
					<strong>Human approval gates stay authoritative</strong>
					<span>Push, merge, publish, deploy, protected files, and secrets remain policy-controlled.</span>
				</div>
				<div>
					<Clock3 aria-hidden="true" size={18} />
					<strong>Bridge executes locally</strong>
					<span>Workers coordinate; the local bridge owns terminal execution and worktree isolation.</span>
				</div>
			</section>
		</div>
	);
}
