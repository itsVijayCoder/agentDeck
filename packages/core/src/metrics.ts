export type MetricName =
	| "run_count"
	| "run_success_count"
	| "run_failure_count"
	| "run_success_rate"
	| "approval_count"
	| "approval_rejection_rate"
	| "agent_usage_by_kind"
	| "provider_usage_by_model"
	| "cost_usd_by_workspace"
	| "latency_p50_ms"
	| "latency_p95_ms"
	| "queue_wait_time_ms"
	| "queue_completion_rate"
	| "scheduled_job_success_rate"
	| "verifier_pass_rate"
	| "secret_redaction_count"
	| "policy_block_count"
	| "jump_in_count"
	| "human_intervention_count";

export type MetricLabels = Record<string, string>;

export type MetricPoint = {
	labels: MetricLabels;
	name: MetricName;
	timestamp: string;
	value: number;
};

export type MetricSummary = {
	avg: number;
	count: number;
	labels: MetricLabels;
	max: number;
	min: number;
	name: MetricName;
	sum: number;
};

type Clock = () => Date;

export class MetricsCollector {
	private readonly clock: Clock;
	private points: MetricPoint[] = [];

	constructor(clock: Clock = () => new Date()) {
		this.clock = clock;
	}

	increment(name: MetricName, labels: MetricLabels = {}): void {
		this.record(name, 1, labels);
	}

	gauge(name: MetricName, value: number, labels: MetricLabels = {}): void {
		this.record(name, value, labels);
	}

	timing(name: MetricName, durationMs: number, labels: MetricLabels = {}): void {
		this.record(name, durationMs, labels);
	}

	peek(): MetricPoint[] {
		return this.points.map(copyMetricPoint);
	}

	flush(): MetricPoint[] {
		const flushed = this.peek();
		this.points = [];
		return flushed;
	}

	summarize(points: readonly MetricPoint[] = this.points): MetricSummary[] {
		const summaries = new Map<string, MetricSummary>();

		for (const point of points) {
			const key = metricSummaryKey(point.name, point.labels);
			const existing = summaries.get(key);
			if (existing) {
				existing.count += 1;
				existing.sum += point.value;
				existing.min = Math.min(existing.min, point.value);
				existing.max = Math.max(existing.max, point.value);
				existing.avg = existing.sum / existing.count;
				continue;
			}

			summaries.set(key, {
				avg: point.value,
				count: 1,
				labels: { ...point.labels },
				max: point.value,
				min: point.value,
				name: point.name,
				sum: point.value,
			});
		}

		return [...summaries.values()];
	}

	private record(name: MetricName, value: number, labels: MetricLabels): void {
		if (!Number.isFinite(value)) {
			throw new TypeError(`Metric ${name} received a non-finite value.`);
		}

		this.points.push({
			labels: { ...labels },
			name,
			timestamp: this.clock().toISOString(),
			value,
		});
	}
}

function copyMetricPoint(point: MetricPoint): MetricPoint {
	return {
		labels: { ...point.labels },
		name: point.name,
		timestamp: point.timestamp,
		value: point.value,
	};
}

function metricSummaryKey(name: MetricName, labels: MetricLabels): string {
	const stableLabels = Object.entries(labels)
		.toSorted(([left], [right]) => left.localeCompare(right))
		.map(([key, value]) => `${key}:${value}`)
		.join(",");
	return `${name}|${stableLabels}`;
}
