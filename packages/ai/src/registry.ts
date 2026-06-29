import { AnthropicAdapter } from "./providers/anthropic";
import { DeepSeekAdapter } from "./providers/deepseek";
import { GoogleAdapter } from "./providers/google";
import { OllamaAdapter } from "./providers/ollama";
import { OpenAIAdapter } from "./providers/openai";
import { OpenRouterAdapter } from "./providers/openrouter";
import { QwenAdapter } from "./providers/qwen";
import type { LlmProviderAdapter } from "./types";

export class ProviderRegistry {
	private readonly adapters = new Map<string, LlmProviderAdapter>();

	constructor(adapters: readonly LlmProviderAdapter[] = []) {
		for (const adapter of adapters) {
			this.register(adapter);
		}
	}

	get(id: string): LlmProviderAdapter | undefined {
		return this.adapters.get(id);
	}

	list(): LlmProviderAdapter[] {
		return [...this.adapters.values()];
	}

	register(adapter: LlmProviderAdapter): void {
		this.adapters.set(adapter.id, adapter);
	}

	require(id: string): LlmProviderAdapter {
		const adapter = this.get(id);
		if (!adapter) {
			throw new Error(`LLM provider adapter '${id}' is not registered.`);
		}

		return adapter;
	}
}

export function createDefaultProviderRegistry(): ProviderRegistry {
	return new ProviderRegistry([
		new OpenAIAdapter(),
		new AnthropicAdapter(),
		new GoogleAdapter(),
		new QwenAdapter(),
		new DeepSeekAdapter(),
		new OllamaAdapter(),
		new OpenRouterAdapter(),
	]);
}
