import { describe, expect, it, vi } from "vitest";

import { CostTracker } from "./cost-tracker";
import { buildProviderGatewayHeaders, createGatewayConfig } from "./gateway";
import { ModelRouter } from "./model-router";
import {
	AnthropicAdapter,
	GoogleAdapter,
	OllamaAdapter,
	OpenAIAdapter,
	buildOpenAiChatPayload,
	parseAnthropicStream,
	resolveOpenAiCompatibleEndpoint,
} from "./providers/index";
import { ProviderRegistry } from "./registry";
import { parseOpenAiChatStream, readServerSentEvents } from "./sse";
import { AiProviderError, llmProviderIds, type FetchLike, type UnifiedAiEvent, type UnifiedChatRequest } from "./types";

const requestWithoutTools: UnifiedChatRequest = {
	messages: [{ content: "Hello", role: "user", toolCallId: "tool_result_1" }],
	model: "model-a",
	stream: true,
};

describe("Phase 10 edge cases", () => {
	it("exports provider constants and structured provider errors", () => {
		const error = new AiProviderError("bad gateway", "openai", 502, true);

		expect(llmProviderIds).toContain("openrouter");
		expect(error).toMatchObject({ message: "bad gateway", name: "AiProviderError", provider: "openai", retryable: true, status: 502 });
	});

	it("handles optional gateway and payload branches", () => {
		const config = createGatewayConfig({ accountId: "acct" });
		expect(config).toMatchObject({ dlpMode: "off", gatewayId: "default", mode: "cloudflare-rest" });
		expect(buildProviderGatewayHeaders(config, { providerApiKey: "key", providerAuthHeader: "x-api-key" })).toEqual({
			"x-api-key": "key",
		});
		expect(buildOpenAiChatPayload(requestWithoutTools, "provider/model")).toEqual({
			messages: [{ content: "Hello", role: "user", tool_call_id: "tool_result_1" }],
			model: "provider/model",
			stream: true,
		});
	});

	it("tracks usage events without optional metadata or explicit cost", () => {
		const tracker = new CostTracker();
		tracker.recordFromEvent({
			inputTokens: 1,
			model: "m",
			outputTokens: 2,
			provider: "p",
			requestId: "r",
			type: "ai.usage",
		});

		expect(tracker.listRecords()[0]).toMatchObject({ costUsd: 0, inputTokens: 1, outputTokens: 2 });
	});

	it("covers OpenAI-compatible endpoint and health branches", async () => {
		const adapter = new OpenAIAdapter();
		const native = resolveOpenAiCompatibleEndpoint(
			{
				id: "custom",
				models: [],
				providerSlug: "custom",
				title: "Custom",
			},
			requestWithoutTools,
			{},
		);
		expect(native).toMatchObject({ ok: false });

		const gateway = resolveOpenAiCompatibleEndpoint(
			{
				gatewayProviderPath: "custom-provider",
				id: "custom",
				models: [],
				providerSlug: "custom",
				title: "Custom",
			},
			requestWithoutTools,
			{
				apiKey: "provider-key",
				gateway: { accountId: "acct", apiToken: "cf-token", dlpMode: "off", gatewayId: "gw", mode: "provider-native-gateway" },
			},
		);
		expect(gateway).toMatchObject({ model: "model-a", ok: true, url: "https://gateway.ai.cloudflare.com/v1/acct/gw/custom-provider/chat/completions" });

		const httpErrorEvents = await collect(adapter.streamChat(requestWithoutTools, { apiKey: "key", fetch: async () => new Response("", { status: 429 }), idFactory: idFactory("req", "msg") }));
		expect(httpErrorEvents.at(-1)).toEqual({ error: "HTTP 429", requestId: "req", status: "error", type: "ai.request.end" });

		expect(await new GoogleAdapter().healthcheck({ apiKey: "key" })).toMatchObject({
			detail: "No native model listing endpoint is configured for this provider.",
			status: "healthy",
		});
		expect(await adapter.healthcheck({
			gateway: { accountId: "acct", dlpMode: "off", gatewayId: "default", mode: "cloudflare-rest" },
		})).toMatchObject({ detail: "Cloudflare API token is not configured.", status: "degraded" });
		expect(await adapter.healthcheck({
			gateway: { accountId: "acct", dlpMode: "off", gatewayId: "default", mode: "provider-native-gateway" },
		})).toMatchObject({ detail: "Cloudflare API token is not configured.", status: "degraded" });
		expect(await adapter.healthcheck({ apiKey: "key", fetch: async () => new Response("", { status: 500 }) })).toMatchObject({
			errorRate: 0.5,
			status: "degraded",
		});
		expect(await adapter.healthcheck({ apiKey: "key", fetch: async () => Promise.reject("offline") })).toMatchObject({
			detail: "Healthcheck failed.",
			status: "down",
		});
	});

	it("covers Anthropic auth, gateway, and stream branches", async () => {
		const adapter = new AnthropicAdapter();
		const missingKeyEvents = await collect(adapter.streamChat(requestWithoutTools, { idFactory: idFactory("req", "msg") }));
		expect(missingKeyEvents.at(-1)).toEqual({
			error: "Native Anthropic calls require an API key for model-a.",
			requestId: "req",
			status: "error",
			type: "ai.request.end",
		});

		const providerGatewayFetch = vi.fn<FetchLike>(async () => responseFromSse(`event: content_block_delta\ndata: ${JSON.stringify({ delta: { text: "G" }, type: "content_block_delta" })}\n\n`));
		const gatewayEvents = await collect(
			adapter.streamChat(requestWithoutTools, {
				fetch: providerGatewayFetch,
				gateway: { accountId: "acct", apiToken: "cf-token", dlpMode: "off", gatewayId: "gw", mode: "provider-native-gateway" },
				idFactory: idFactory("req", "msg"),
			}),
		);
		expect(providerGatewayFetch.mock.calls[0]?.[0]).toBe("https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic/v1/messages");
		expect(gatewayEvents).toContainEqual({ delta: "G", messageId: "msg", type: "ai.text.delta" });

		const restErrorEvents = await collect(
			adapter.streamChat(requestWithoutTools, {
				fetch: async () => new Response("", { status: 400 }),
				gateway: { accountId: "acct", apiToken: "cf-token", dlpMode: "off", gatewayId: "gw", mode: "cloudflare-rest" },
				idFactory: idFactory("req", "msg"),
			}),
		);
		expect(restErrorEvents.at(-1)).toEqual({ error: "HTTP 400", requestId: "req", status: "error", type: "ai.request.end" });

		expect(await adapter.healthcheck({ now: () => 1_000 })).toMatchObject({ detail: "Anthropic API key is not configured.", status: "degraded" });
		expect(await adapter.healthcheck({
			apiKey: "anthropic-key",
			gateway: { accountId: "acct", dlpMode: "off", gatewayId: "gw", mode: "provider-native-gateway" },
		})).toMatchObject({ status: "healthy" });
		expect(await adapter.healthcheck({ apiKey: "key", fetch: async () => new Response("", { status: 200 }) })).toMatchObject({
			status: "healthy",
		});
		expect((await adapter.estimateCost(requestWithoutTools, "unknown")).costUsd).toBe(0);

		const parsed = await collect(
			parseAnthropicStream({
				body: stream([
					`event: content_block_start\ndata: ${JSON.stringify({ content_block: { type: "text" }, index: 2, type: "content_block_start" })}\n\n`,
					`event: content_block_start\ndata: ${JSON.stringify({ content_block: { type: "tool_use" }, index: 3, type: "content_block_start" })}\n\n`,
					`event: content_block_delta\ndata: ${JSON.stringify({ delta: { partial_json: "not-json" }, index: 3, type: "content_block_delta" })}\n\n`,
				].join("")),
				messageId: "msg",
				model: "claude",
				requestId: "req",
			}),
		);
		expect(parsed).toContainEqual({ argsPartial: undefined, name: "tool", toolCallId: "tool-3", type: "ai.tool_call.start" });
		expect(parsed).toContainEqual({ args: "not-json", toolCallId: "tool-3", type: "ai.tool_call.end" });
	});

	it("covers Ollama fallback and error branches", async () => {
		const adapter = new OllamaAdapter();

		await expect(adapter.listModels({ fetch: async () => Response.json({ models: [] }) })).resolves.toMatchObject([{ id: "llama3.1" }]);
		await expect(adapter.listModels({ fetch: async () => Response.json({ models: [{ size: 1 }] }) })).resolves.toMatchObject([{ id: "local-model" }]);
		await expect(adapter.listModels({ fetch: async () => Response.json({ models: "bad" }) })).resolves.toMatchObject([{ id: "llama3.1" }]);
		const events = await collect(adapter.streamChat(requestWithoutTools, { fetch: async () => new Response("", { status: 503 }), idFactory: idFactory("req", "msg") }));
		expect(events.at(-1)).toEqual({ error: "HTTP 503", requestId: "req", status: "error", type: "ai.request.end" });
		expect(await adapter.healthcheck({ fetch: async () => new Response("", { status: 503 }) })).toMatchObject({ errorRate: 0.5, status: "degraded" });
		expect(await adapter.healthcheck({ fetch: async () => Promise.reject("offline") })).toMatchObject({
			detail: "Ollama healthcheck failed.",
			status: "down",
		});
	});

	it("covers router primary, fallback, and failure recording branches", async () => {
		const router = new ModelRouter({ registry: new ProviderRegistry([new OpenAIAdapter()]) });
		expect(router.listProviders()).toHaveLength(1);
		expect(router.resolveRoute({ providerId: "openai" })).toMatchObject({ providerId: "openai", reason: "Primary provider selected." });
		expect(router.resolveRoute({ fallbackProviderIds: ["openai"], providerId: "missing" })).toMatchObject({
			providerId: "openai",
			reason: "Fallback provider selected.",
			skipped: [{ providerId: "missing", reason: "Provider adapter is not registered." }],
		});

		await collect(router.streamChat({ providerId: "openai", request: requestWithoutTools }, { idFactory: idFactory("req", "msg") }));
		expect(router.snapshotCircuits().openai).toMatchObject({ failureCount: 1, state: "closed" });
	});

	it("covers SSE branches without data and estimated usage", async () => {
		const frames = [];
		for await (const event of readServerSentEvents(stream(": keep-alive\n\n"))) {
			frames.push(event);
		}
		expect(frames).toEqual([]);

		const parsed = await collect(
			parseOpenAiChatStream({
				body: stream('data: {"choices":[{"delta":{"content":"abcd","tool_calls":[{"index":2,"function":{"arguments":"raw"}}]}}]}\n\n'),
				messageId: "msg",
				model: "m",
				provider: "p",
				requestId: "r",
			}),
		);
		expect(parsed).toContainEqual({ args: "raw", toolCallId: "tool-2", type: "ai.tool_call.end" });
		expect(parsed).toContainEqual({ inputTokens: 0, model: "m", outputTokens: 1, provider: "p", requestId: "r", type: "ai.usage" });
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

function stream(text: string): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	});
}

function idFactory(...ids: string[]): () => string {
	let index = 0;
	return () => ids[index++] ?? `id_${index}`;
}
