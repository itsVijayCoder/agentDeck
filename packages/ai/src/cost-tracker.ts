import type { CostEstimate, ModelDescriptor, UnifiedAiEvent, UnifiedChatMessage, UnifiedChatRequest } from "./types";

export type CostRecord = {
	costUsd: number;
	createdAt: string;
	inputTokens: number;
	model: string;
	outputTokens: number;
	provider: string;
	requestId: string;
	runId?: string;
	workspaceId?: string;
};

export type CostSummary = {
	inputTokens: number;
	outputTokens: number;
	requestCount: number;
	totalCostUsd: number;
};

export class CostTracker {
	private records: CostRecord[] = [];

	record(record: CostRecord): void {
		this.records.push(record);
	}

	recordFromEvent(event: UnifiedAiEvent, metadata: { runId?: string; workspaceId?: string } = {}, now = new Date()): void {
		if (event.type !== "ai.usage") {
			return;
		}

		this.record({
			costUsd: event.costUsd ?? 0,
			createdAt: now.toISOString(),
			inputTokens: event.inputTokens,
			model: event.model,
			outputTokens: event.outputTokens,
			provider: event.provider,
			requestId: event.requestId,
			...(metadata.runId ? { runId: metadata.runId } : {}),
			...(metadata.workspaceId ? { workspaceId: metadata.workspaceId } : {}),
		});
	}

	listRecords(): CostRecord[] {
		return [...this.records];
	}

	reset(): void {
		this.records = [];
	}

	summarize(filter: { provider?: string; workspaceId?: string } = {}): CostSummary {
		const records = this.records.filter(
			(record) =>
				(filter.provider === undefined || record.provider === filter.provider) &&
				(filter.workspaceId === undefined || record.workspaceId === filter.workspaceId),
		);

		return records.reduce<CostSummary>(
			(summary, record) => ({
				inputTokens: summary.inputTokens + record.inputTokens,
				outputTokens: summary.outputTokens + record.outputTokens,
				requestCount: summary.requestCount + 1,
				totalCostUsd: roundMoney(summary.totalCostUsd + record.costUsd),
			}),
			{ inputTokens: 0, outputTokens: 0, requestCount: 0, totalCostUsd: 0 },
		);
	}
}

export function estimateTokenCount(messages: readonly UnifiedChatMessage[]): number {
	return messages.reduce((total, message) => total + Math.ceil(message.content.length / 4), 0);
}

export function estimateRequestCost(request: UnifiedChatRequest, model: ModelDescriptor | undefined): CostEstimate {
	const inputTokens = estimateTokenCount(request.messages);
	const outputTokens = request.maxTokens ?? 1_000;
	const inputCost = model?.costPerMtokInput ?? 0;
	const outputCost = model?.costPerMtokOutput ?? 0;

	return {
		costUsd: roundMoney((inputTokens * inputCost + outputTokens * outputCost) / 1_000_000),
		inputTokens,
		outputTokens,
	};
}

export function roundMoney(value: number): number {
	return Math.round(value * 1_000_000) / 1_000_000;
}
