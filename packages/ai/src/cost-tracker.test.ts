import { describe, expect, it } from "vitest";

import { CostTracker, estimateRequestCost, estimateTokenCount, roundMoney } from "./cost-tracker";
import type { ModelDescriptor, UnifiedChatRequest } from "./types";

const request: UnifiedChatRequest = {
	maxTokens: 8,
	messages: [
		{ content: "12345678", role: "user" },
		{ content: "abcd", role: "assistant" },
	],
	model: "test-model",
	stream: true,
};

const model: ModelDescriptor = {
	costPerMtokInput: 1,
	costPerMtokOutput: 2,
	displayName: "Test",
	id: "test-model",
	provider: "openai",
	supportsStreaming: true,
	supportsToolCalls: true,
	supportsVision: false,
};

describe("CostTracker", () => {
	it("estimates token counts and costs", () => {
		expect(estimateTokenCount(request.messages)).toBe(3);
		expect(estimateRequestCost(request, model)).toEqual({
			costUsd: 0.000019,
			inputTokens: 3,
			outputTokens: 8,
		});
		expect(estimateRequestCost(request, undefined).costUsd).toBe(0);
		expect(roundMoney(1.1234567)).toBe(1.123457);
	});

	it("records usage events and summarizes by provider or workspace", () => {
		const tracker = new CostTracker();
		tracker.recordFromEvent({ messageId: "msg", role: "assistant", type: "ai.message.start" });
		tracker.recordFromEvent(
			{
				costUsd: 0.25,
				inputTokens: 100,
				model: "gpt",
				outputTokens: 50,
				provider: "openai",
				requestId: "req_1",
				type: "ai.usage",
			},
			{ runId: "run_1", workspaceId: "wrk_1" },
			new Date("2026-01-01T00:00:00.000Z"),
		);
		tracker.record({
			costUsd: 0.5,
			createdAt: "2026-01-01T00:01:00.000Z",
			inputTokens: 10,
			model: "claude",
			outputTokens: 20,
			provider: "anthropic",
			requestId: "req_2",
			workspaceId: "wrk_2",
		});

		expect(tracker.listRecords()).toHaveLength(2);
		expect(tracker.summarize()).toEqual({ inputTokens: 110, outputTokens: 70, requestCount: 2, totalCostUsd: 0.75 });
		expect(tracker.summarize({ provider: "openai" })).toEqual({
			inputTokens: 100,
			outputTokens: 50,
			requestCount: 1,
			totalCostUsd: 0.25,
		});
		expect(tracker.summarize({ workspaceId: "wrk_2" }).totalCostUsd).toBe(0.5);
		tracker.reset();
		expect(tracker.summarize().requestCount).toBe(0);
	});
});
