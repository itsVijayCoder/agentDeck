import { CircuitBreaker, type CircuitBreakerSnapshot } from "./circuit-breaker";
import { createDefaultProviderRegistry, ProviderRegistry } from "./registry";
import type { LlmProviderAdapter, ProviderContext, UnifiedAiEvent, UnifiedChatRequest } from "./types";

export type ProviderRouteDecision = {
	providerId: string;
	reason: string;
	skipped: Array<{ providerId: string; reason: string }>;
};

export type ModelRouteRequest = {
	fallbackProviderIds?: readonly string[];
	providerId: string;
	request: UnifiedChatRequest;
};

export type ModelRouterOptions = {
	breakerFactory?: (providerId: string) => CircuitBreaker;
	registry?: ProviderRegistry;
};

export class ModelRouter {
	private readonly breakers = new Map<string, CircuitBreaker>();
	private readonly breakerFactory: (providerId: string) => CircuitBreaker;
	private readonly registry: ProviderRegistry;

	constructor(options: ModelRouterOptions = {}) {
		this.registry = options.registry ?? createDefaultProviderRegistry();
		this.breakerFactory = options.breakerFactory ?? (() => new CircuitBreaker());
	}

	listProviders(): LlmProviderAdapter[] {
		return this.registry.list();
	}

	resolveRoute(input: Pick<ModelRouteRequest, "fallbackProviderIds" | "providerId">): ProviderRouteDecision {
		const providerIds = unique([input.providerId, ...(input.fallbackProviderIds ?? [])]);
		const skipped: ProviderRouteDecision["skipped"] = [];

		for (const providerId of providerIds) {
			if (!this.registry.get(providerId)) {
				skipped.push({ providerId, reason: "Provider adapter is not registered." });
				continue;
			}

			if (!this.breakerFor(providerId).canExecute()) {
				skipped.push({ providerId, reason: "Provider circuit is open." });
				continue;
			}

			return {
				providerId,
				reason: providerId === input.providerId ? "Primary provider selected." : "Fallback provider selected.",
				skipped,
			};
		}

		throw new Error("No available LLM provider route.");
	}

	async *streamChat(input: ModelRouteRequest, ctx: ProviderContext): AsyncIterable<UnifiedAiEvent> {
		const decision = this.resolveRoute(input);
		const adapter = this.registry.require(decision.providerId);
		let succeeded = false;

		for await (const event of adapter.streamChat(input.request, ctx)) {
			if (event.type === "ai.request.end") {
				succeeded = event.status === "success";
			}
			yield event;
		}

		if (succeeded) {
			this.breakerFor(decision.providerId).recordSuccess();
		} else {
			this.breakerFor(decision.providerId).recordFailure();
		}
	}

	snapshotCircuits(): Record<string, CircuitBreakerSnapshot> {
		return Object.fromEntries([...this.breakers.entries()].map(([providerId, breaker]) => [providerId, breaker.snapshot()]));
	}

	private breakerFor(providerId: string): CircuitBreaker {
		const existing = this.breakers.get(providerId);
		if (existing) {
			return existing;
		}

		const breaker = this.breakerFactory(providerId);
		this.breakers.set(providerId, breaker);
		return breaker;
	}
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}
