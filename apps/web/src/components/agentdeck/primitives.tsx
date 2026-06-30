import type {
	DecisionReportCandidate,
	GraphNodeStatus,
	RiskLevel,
	VerificationResult,
	VerificationStatus,
} from "@agentdeck/core";

export const graphStatusLabels: Record<GraphNodeStatus, string> = {
	blocked: "Blocked",
	complete: "Complete",
	idle: "Idle",
	running: "Running",
	waiting: "Waiting",
};

const verificationLabels: Record<VerificationStatus, string> = {
	failed: "Failed",
	passed: "Passed",
	pending: "Pending",
	warning: "Warning",
};

export function CandidateRow({ candidate, rank }: { candidate: DecisionReportCandidate; rank: number }) {
	return (
		<article className={`of-candidate-row is-${candidate.recommendation}`}>
			<div className="of-candidate-main">
				<span className="of-candidate-rank">{rank}</span>
				<div>
					<strong>{candidate.agent}</strong>
					<span>
						{candidate.status} / {candidate.latencyLabel}
					</span>
				</div>
			</div>
			<div className="of-candidate-score">{Math.round(candidate.score * 100)}</div>
			<div className="of-candidate-evidence">
				<VerificationBadge status={candidate.verificationStatus} />
				<p>{candidate.notes}</p>
			</div>
		</article>
	);
}

export function ConfidenceMeter({ value }: { value: number }) {
	return (
		<div className="of-confidence" aria-label={`Confidence ${Math.round(value * 100)} percent`}>
			<svg viewBox="0 0 42 42" aria-hidden="true">
				<circle cx="21" cy="21" r="16" />
				<circle cx="21" cy="21" r="16" style={{ strokeDasharray: `${value * 100} 100` }} />
			</svg>
			<strong>{Math.round(value * 100)}%</strong>
		</div>
	);
}

export function Metric({ label, tone, value }: { label: string; tone?: "approval"; value: string }) {
	return (
		<div className={tone ? `of-metric is-${tone}` : "of-metric"}>
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
	return <span className={`of-risk is-${risk}`}>{risk}</span>;
}

export function StatusChip({ status }: { status: GraphNodeStatus }) {
	return <span className={`of-status-chip is-${status}`}>{graphStatusLabels[status]}</span>;
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
	return <span className={`of-verdict is-${status}`}>{verificationLabels[status]}</span>;
}

export function VerificationCard({ result }: { result: VerificationResult }) {
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
