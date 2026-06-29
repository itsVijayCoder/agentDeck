import { describe, expect, it, vi } from "vitest";

import { CircuitBreaker } from "./circuit-breaker";
import { ModelRouter } from "./model-router";
import { AnthropicAdapter, GoogleAdapter, OllamaAdapter, OpenAIAdapter, QwenAdapter, parseAnthropicStream } from "./providers/index";
import { createDefaultProviderRegistry, ProviderRegistry } from "./registry";
import type { FetchLike, UnifiedAiEvent, UnifiedChatRequest } from "./types";
import { stream } from "./sse.test";

const chatRequest: UnifiedChatRequest = {
	maxTokens: 32,
	messages: [
		{ content: "You are concise.", role: "system" },
		{ content: "Hello", role: "user" },
	],
	model: "gpt-4o-mini",
	stream: true,
	temperature: 0.1,
	tools: [{ description: "Run tests", inputSchema: { type: "object" }, name: "run_tests" }],
};

describe("provider registry", () => {
	it("registers all Phase 10 adapters", () => {
		const registry = createDefaultProviderRegistry();

		expect(registry.list().map((adapter) => adapter.id)).toEqual([
			"openai",
			"anthropic",
			"google",
			"qwen",
			"deepseek",
			"ollama",
			"openrouter",
		]);
		expect(registry.require("openai").displayName).toBe("OpenAI");
		expect(() => registry.require("missing")).toThrow("not registered");
	});
});

describe("OpenAI-compatible adapters", () => {
	it("streams through Cloudflare REST AI Gateway with provider-prefixed models", async () => {
		const fetcher = vi.fn<FetchLike>(async () => responseFromSse("data: {\"choices\":[{\"delta\":{\"content\":\"OK\"}}]}\n\n"));
		const adapter = new OpenAIAdapter();

		const events = await collect(
			adapter.streamChat(chatRequest, {
				fetch: fetcher,
				gateway: {
					accountId: "acct",
					apiToken: "cf-token",
					dlpMode: "request-only",
					gatewayId: "default",
					mode: "cloudflare-rest",
				},
				idFactory: idFactory("req", "msg"),
			}),
		);

		expect(fetcher).toHaveBeenCalledWith(
			"https://api.cloudflare.com/client/v4/accounts/acct/ai/v1/chat/completions",
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: "Bearer cf-token",
					"cf-aig-gateway-id": "default",
				}),
			}),
		);
		const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
		expect(body.model).toBe("openai/gpt-4o-mini");
		expect(events).toContainEqual({ delta: "OK", messageId: "msg", type: "ai.text.delta" });
		expect(events.at(-1)).toEqual({ requestId: "req", status: "success", type: "ai.request.end" });
	});

	it("reports endpoint errors and estimates costs from model descriptors", async () => {
		const adapter = new OpenAIAdapter();
		const events = await collect(adapter.streamChat(chatRequest, { idFactory: idFactory("req", "msg") }));
		const estimate = await adapter.estimateCost(chatRequest, "gpt-4o-mini");

		expect(events).toEqual([
			{ model: "gpt-4o-mini", provider: "openai", requestId: "req", type: "ai.request.start" },
			{
				error: "Native OpenAI calls require an API key, a custom base URL, or Cloudflare AI Gateway.",
				requestId: "req",
				status: "error",
				type: "ai.request.end",
			},
		]);
		expect(estimate.inputTokens).toBeGreaterThan(0);
		expect(estimate.costUsd).toBeGreaterThan(0);
	});

	it("supports provider-native gateway and native healthchecks", async () => {
		const fetcher = vi.fn<FetchLike>(async () => new Response("{}", { status: 200 }));
		const adapter = new OpenAIAdapter();

		expect(await adapter.healthcheck({ fetch: fetcher, apiKey: "openai-key", now: fixedClock(1_000, 1_150) })).toMatchObject({
			errorRate: 0,
			latencyMs: 150,
			status: "healthy",
		});
		expect(await adapter.healthcheck({ now: fixedClock(1_000, 1_000) })).toMatchObject({
			errorRate: 1,
			status: "degraded",
		});
		expect(await new GoogleAdapter().healthcheck({
			gateway: { accountId: "acct", apiToken: "cf-token", dlpMode: "off", gatewayId: "default", mode: "cloudflare-rest" },
		})).toMatchObject({ status: "healthy" });
		expect(await new QwenAdapter().healthcheck({ baseUrl: "https://example.test", apiKey: "qwen-key", fetch: fetcher })).toMatchObject({
			status: "healthy",
		});
	});
});

describe("AnthropicAdapter", () => {
	it("streams native Anthropic events", async () => {
		const adapter = new AnthropicAdapter();
		const fetcher = vi.fn<FetchLike>(async () =>
			responseFromSse(
				[
					`event: content_block_start\ndata: ${JSON.stringify({ content_block: { id: "tool_1", input: { path: "x" }, name: "read_file", type: "tool_use" }, index: 0, type: "content_block_start" })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ delta: { text: "Hi" }, type: "content_block_delta" })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ delta: { partial_json: "{\"path\":\"src\"}" }, index: 0, type: "content_block_delta" })}\n\n`,
					`event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 5 } })}\n\n`,
				].join(""),
			),
		);

		const events = await collect(adapter.streamChat(chatRequest, { apiKey: "anthropic-key", fetch: fetcher, idFactory: idFactory("req", "msg") }));
		expect(events).toContainEqual({ argsPartial: { path: "x" }, name: "read_file", toolCallId: "tool_1", type: "ai.tool_call.start" });
		expect(events).toContainEqual({ delta: "Hi", messageId: "msg", type: "ai.text.delta" });
		expect(events).toContainEqual({ args: { path: "src" }, toolCallId: "tool-0", type: "ai.tool_call.end" });
		expect(events).toContainEqual({
			inputTokens: 0,
			model: "gpt-4o-mini",
			outputTokens: 5,
			provider: "anthropic",
			requestId: "req",
			type: "ai.usage",
		});
	});

	it("supports Cloudflare REST, health states, and standalone stream parsing", async () => {
		const adapter = new AnthropicAdapter();
		const gatewayEvents = await collect(
			adapter.streamChat(chatRequest, {
				fetch: async () => responseFromSse("data: {\"choices\":[{\"delta\":{\"content\":\"A\"}}]}\n\n"),
				gateway: { accountId: "acct", apiToken: "cf-token", dlpMode: "off", gatewayId: "default", mode: "cloudflare-rest" },
				idFactory: idFactory("req", "msg"),
			}),
		);

		expect(gatewayEvents).toContainEqual({ delta: "A", messageId: "msg", type: "ai.text.delta" });
		expect(await adapter.healthcheck({ gateway: { accountId: "acct", dlpMode: "off", gatewayId: "default", mode: "provider-native-gateway" } })).toMatchObject({
			status: "degraded",
		});
		expect(await adapter.healthcheck({ apiKey: "key", fetch: async () => new Response("{}", { status: 500 }) })).toMatchObject({
			errorRate: 0.5,
			status: "degraded",
		});
		expect(await adapter.healthcheck({ apiKey: "key", fetch: async () => Promise.reject(new Error("offline")) })).toMatchObject({
			status: "down",
		});

		const parsed = await collect(
			parseAnthropicStream({ body: stream("data: not-json\n\n"), messageId: "msg", model: "claude", requestId: "req" }),
		);
		expect(parsed).toContainEqual({ messageId: "msg", outputText: "", type: "ai.message.end" });
	});
});

describe("OllamaAdapter", () => {
	it("lists local models, streams local completions, and reports health", async () => {
		const adapter = new OllamaAdapter();
		const fetcher = vi.fn<FetchLike>(async (url) => {
			if (String(url).endsWith("/api/tags")) {
				return Response.json({ models: [{ name: "codellama" }] });
			}
			return responseFromSse("data: {\"choices\":[{\"delta\":{\"content\":\"local\"}}]}\n\n");
		});

		await expect(adapter.listModels({ baseUrl: "http://ollama.test", fetch: fetcher })).resolves.toMatchObject([{ id: "codellama" }]);
		expect(await adapter.healthcheck({ baseUrl: "http://ollama.test", fetch: fetcher })).toMatchObject({ status: "healthy" });
		const events = await collect(adapter.streamChat(chatRequest, { baseUrl: "http://ollama.test", fetch: fetcher, idFactory: idFactory("req", "msg") }));
		expect(events).toContainEqual({ delta: "local", messageId: "msg", type: "ai.text.delta" });
		expect((await adapter.estimateCost(chatRequest, "codellama")).costUsd).toBe(0);
	});

	it("falls back for failed model listing and reports down health", async () => {
		const adapter = new OllamaAdapter();

		await expect(adapter.listModels({ fetch: async () => new Response("", { status: 500 }) })).resolves.toMatchObject([{ id: "llama3.1" }]);
		await expect(adapter.healthcheck({ fetch: async () => Promise.reject(new Error("offline")) })).resolves.toMatchObject({ status: "down" });
	});
});

describe("ModelRouter", () => {
	it("skips open provider circuits and records successes", async () => {
		let now = 0;
		const openBreaker = new CircuitBreaker({ failureThreshold: 1, now: () => now, resetTimeoutMs: 1_000 });
		openBreaker.recordFailure();
		const registry = new ProviderRegistry([new OpenAIAdapter(), new OllamaAdapter()]);
		const router = new ModelRouter({
			breakerFactory: (providerId) => (providerId === "openai" ? openBreaker : new CircuitBreaker()),
			registry,
		});

		const decision = router.resolveRoute({ fallbackProviderIds: ["ollama"], providerId: "openai" });
		expect(decision).toMatchObject({ providerId: "ollama", skipped: [{ providerId: "openai", reason: "Provider circuit is open." }] });

		const events = await collect(
			router.streamChat(
				{ fallbackProviderIds: ["ollama"], providerId: "openai", request: chatRequest },
				{ fetch: async () => responseFromSse("data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n"), idFactory: idFactory("req", "msg") },
			),
		);
		expect(events.at(-1)).toEqual({ requestId: "req", status: "success", type: "ai.request.end" });
		expect(router.snapshotCircuits().ollama?.state).toBe("closed");

		expect(() => new ModelRouter({ registry: new ProviderRegistry([]) }).resolveRoute({ providerId: "missing" })).toThrow("No available");
		now = 1_001;
		expect(openBreaker.canExecute()).toBe(true);
	});
});

async function collect(iterable: AsyncIterable<UnifiedAiEvent>): Promise<UnifiedAiEvent[]> {
	const events: UnifiedAiEvent[] = [];
	for await (const event of iterable) {
		events.push(event);
	}
	return events;
}

function responseFromSse(text: string): Response {
	return new Response(stream(text), { headers: { "Content-Type": "text/event-stream" } });
}

function idFactory(...ids: string[]): () => string {
	let index = 0;
	return () => ids[index++] ?? `id_${index}`;
}

function fixedClock(...values: number[]): () => number {
	let index = 0;
	return () => values[index++] ?? values.at(-1) ?? 0;
}
