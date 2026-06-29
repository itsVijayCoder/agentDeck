import { estimateRequestCost } from "../cost-tracker";
import { parseOpenAiChatStream } from "../sse";
import { ollamaFallbackModels, model } from "./catalog";
import type {
	CostEstimate,
	LlmProviderAdapter,
	ModelDescriptor,
	ProviderContext,
	ProviderHealth,
	ProviderMode,
	UnifiedAiEvent,
	UnifiedChatRequest,
	WireApi,
} from "../types";

export class OllamaAdapter implements LlmProviderAdapter {
	readonly displayName = "Ollama";
	readonly id = "ollama";
	readonly supportedModes: readonly ProviderMode[] = ["local"];
	readonly supportedWireApis: readonly WireApi[] = ["openai-chat", "ollama-chat"];

	async listModels(ctx: ProviderContext): Promise<ModelDescriptor[]> {
		const response = await (ctx.fetch ?? fetch)(`${localBaseUrl(ctx)}/api/tags`, { method: "GET", signal: ctx.signal });
		if (!response.ok) {
			return ollamaFallbackModels.map((item) => ({ ...item }));
		}

		const payload = (await response.json()) as unknown;
		const models = objectArrayField(payload, "models");
		if (!models.length) {
			return ollamaFallbackModels.map((item) => ({ ...item }));
		}

		return models.map((item) =>
			model("ollama", stringField(item, "name") ?? "local-model", {
				contextWindow: 8_192,
				costPerMtokInput: 0,
				costPerMtokOutput: 0,
				supportsStreaming: true,
				supportsToolCalls: false,
				supportsVision: false,
			}),
		);
	}

	async *streamChat(request: UnifiedChatRequest, ctx: ProviderContext): AsyncIterable<UnifiedAiEvent> {
		const requestId = createId(ctx);
		const messageId = createId(ctx);
		yield { model: request.model, provider: this.id, requestId, type: "ai.request.start" };

		const response = await (ctx.fetch ?? fetch)(`${localBaseUrl(ctx)}/v1/chat/completions`, {
			body: JSON.stringify({
				max_tokens: request.maxTokens,
				messages: request.messages,
				model: request.model,
				stream: request.stream,
				temperature: request.temperature,
			}),
			headers: { "Content-Type": "application/json" },
			method: "POST",
			signal: ctx.signal,
		});

		if (!response.ok || !response.body) {
			yield { error: `HTTP ${response.status}`, requestId, status: "error", type: "ai.request.end" };
			return;
		}

		yield { messageId, role: "assistant", type: "ai.message.start" };
		for await (const event of parseOpenAiChatStream({
			body: response.body,
			messageId,
			model: request.model,
			provider: this.id,
			requestId,
		})) {
			yield event;
		}
		yield { requestId, status: "success", type: "ai.request.end" };
	}

	async estimateCost(request: UnifiedChatRequest, modelId: string): Promise<CostEstimate> {
		const descriptor = model("ollama", modelId, {
			costPerMtokInput: 0,
			costPerMtokOutput: 0,
			supportsStreaming: true,
			supportsToolCalls: false,
			supportsVision: false,
		});
		return estimateRequestCost(request, descriptor);
	}

	async healthcheck(ctx: ProviderContext): Promise<ProviderHealth> {
		const startedAt = ctx.now?.() ?? Date.now();
		const checkedAt = new Date(startedAt).toISOString();

		try {
			const response = await (ctx.fetch ?? fetch)(`${localBaseUrl(ctx)}/api/tags`, { method: "GET", signal: ctx.signal });
			return {
				detail: response.ok ? "Local Ollama daemon is reachable." : `Ollama returned HTTP ${response.status}.`,
				errorRate: response.ok ? 0 : 0.5,
				lastCheckedAt: checkedAt,
				latencyMs: Math.max(0, (ctx.now?.() ?? Date.now()) - startedAt),
				status: response.ok ? "healthy" : "degraded",
			};
		} catch (error) {
			return {
				detail: error instanceof Error ? error.message : "Ollama healthcheck failed.",
				errorRate: 1,
				lastCheckedAt: checkedAt,
				latencyMs: Math.max(0, (ctx.now?.() ?? Date.now()) - startedAt),
				status: "down",
			};
		}
	}
}

function localBaseUrl(ctx: ProviderContext): string {
	return (ctx.baseUrl ?? "http://localhost:11434").replace(/\/+$/g, "");
}

function createId(ctx: ProviderContext): string {
	return ctx.idFactory?.() ?? crypto.randomUUID();
}

function objectArrayField(value: unknown, key: string): Array<Record<string, unknown>> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return [];
	}

	const field = (value as Record<string, unknown>)[key];
	return Array.isArray(field)
		? field.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
		: [];
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
	const field = value[key];
	return typeof field === "string" && field.length > 0 ? field : undefined;
}
