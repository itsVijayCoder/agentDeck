import type { LlmProviderId, ModelDescriptor } from "../types";

export function model(
	provider: LlmProviderId | string,
	id: string,
	input: Omit<ModelDescriptor, "displayName" | "id" | "provider"> & { displayName?: string },
): ModelDescriptor {
	return {
		displayName: input.displayName ?? id,
		id,
		provider,
		supportsStreaming: input.supportsStreaming,
		supportsToolCalls: input.supportsToolCalls,
		supportsVision: input.supportsVision,
		...(input.contextWindow === undefined ? {} : { contextWindow: input.contextWindow }),
		...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
		...(input.costPerMtokInput === undefined ? {} : { costPerMtokInput: input.costPerMtokInput }),
		...(input.costPerMtokOutput === undefined ? {} : { costPerMtokOutput: input.costPerMtokOutput }),
	};
}

export const openAiModels: readonly ModelDescriptor[] = [
	model("openai", "gpt-4o-mini", {
		contextWindow: 128_000,
		costPerMtokInput: 0.15,
		costPerMtokOutput: 0.6,
		maxOutputTokens: 16_384,
		supportsStreaming: true,
		supportsToolCalls: true,
		supportsVision: true,
	}),
	model("openai", "gpt-4o", {
		contextWindow: 128_000,
		costPerMtokInput: 2.5,
		costPerMtokOutput: 10,
		maxOutputTokens: 16_384,
		supportsStreaming: true,
		supportsToolCalls: true,
		supportsVision: true,
	}),
];

export const anthropicModels: readonly ModelDescriptor[] = [
	model("anthropic", "claude-sonnet-4-5", {
		contextWindow: 200_000,
		costPerMtokInput: 3,
		costPerMtokOutput: 15,
		displayName: "Claude Sonnet 4.5",
		maxOutputTokens: 64_000,
		supportsStreaming: true,
		supportsToolCalls: true,
		supportsVision: true,
	}),
	model("anthropic", "claude-haiku-3-5", {
		contextWindow: 200_000,
		costPerMtokInput: 0.8,
		costPerMtokOutput: 4,
		displayName: "Claude Haiku 3.5",
		maxOutputTokens: 8_192,
		supportsStreaming: true,
		supportsToolCalls: true,
		supportsVision: true,
	}),
];

export const googleModels: readonly ModelDescriptor[] = [
	model("google", "gemini-2.5-flash", {
		contextWindow: 1_000_000,
		maxOutputTokens: 65_536,
		supportsStreaming: true,
		supportsToolCalls: true,
		supportsVision: true,
	}),
	model("google", "gemini-2.5-pro", {
		contextWindow: 1_000_000,
		maxOutputTokens: 65_536,
		supportsStreaming: true,
		supportsToolCalls: true,
		supportsVision: true,
	}),
];

export const qwenModels: readonly ModelDescriptor[] = [
	model("qwen", "qwen-coder", {
		supportsStreaming: true,
		supportsToolCalls: true,
		supportsVision: false,
	}),
];

export const deepSeekModels: readonly ModelDescriptor[] = [
	model("deepseek", "deepseek-chat", {
		supportsStreaming: true,
		supportsToolCalls: true,
		supportsVision: false,
	}),
	model("deepseek", "deepseek-reasoner", {
		supportsStreaming: true,
		supportsToolCalls: false,
		supportsVision: false,
	}),
];

export const openRouterModels: readonly ModelDescriptor[] = [
	model("openrouter", "auto", {
		displayName: "OpenRouter Auto",
		supportsStreaming: true,
		supportsToolCalls: true,
		supportsVision: true,
	}),
];

export const ollamaFallbackModels: readonly ModelDescriptor[] = [
	model("ollama", "llama3.1", {
		contextWindow: 8_192,
		costPerMtokInput: 0,
		costPerMtokOutput: 0,
		supportsStreaming: true,
		supportsToolCalls: false,
		supportsVision: false,
	}),
];
