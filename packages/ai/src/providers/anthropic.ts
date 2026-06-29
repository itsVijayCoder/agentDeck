import { estimateRequestCost } from "../cost-tracker";
import { buildCloudflareRestHeaders, buildCloudflareRestUrl, buildProviderGatewayHeaders, buildProviderGatewayUrl, normalizeGatewayModel } from "../gateway";
import { parseOpenAiChatStream, parseUsage, readServerSentEvents } from "../sse";
import { anthropicModels } from "./catalog";
import type {
	CostEstimate,
	LlmProviderAdapter,
	ModelDescriptor,
	ProviderContext,
	ProviderHealth,
	ProviderMode,
	UnifiedAiEvent,
	UnifiedChatMessage,
	UnifiedChatRequest,
	WireApi,
} from "../types";

const anthropicVersion = "2023-06-01";

export class AnthropicAdapter implements LlmProviderAdapter {
	readonly displayName = "Anthropic";
	readonly id = "anthropic";
	readonly supportedModes: readonly ProviderMode[] = ["native", "cloudflare-gateway", "cloudflare-rest", "byok", "managed"];
	readonly supportedWireApis: readonly WireApi[] = ["anthropic-messages", "openai-chat"];

	async listModels(): Promise<ModelDescriptor[]> {
		return anthropicModels.map((model) => ({ ...model }));
	}

	async *streamChat(request: UnifiedChatRequest, ctx: ProviderContext): AsyncIterable<UnifiedAiEvent> {
		if (ctx.gateway?.mode === "cloudflare-rest") {
			yield* this.streamCloudflareRest(request, ctx);
			return;
		}

		const requestId = createId(ctx);
		const messageId = createId(ctx);
		const endpoint = resolveAnthropicEndpoint(request, ctx);

		yield { model: request.model, provider: this.id, requestId, type: "ai.request.start" };
		if (!endpoint.ok) {
			yield { error: endpoint.error, requestId, status: "error", type: "ai.request.end" };
			return;
		}

		const response = await (ctx.fetch ?? fetch)(endpoint.url, {
			body: JSON.stringify(buildAnthropicPayload(request)),
			headers: {
				"Content-Type": "application/json",
				"anthropic-version": anthropicVersion,
				...endpoint.headers,
			},
			method: "POST",
			signal: ctx.signal,
		});

		if (!response.ok || !response.body) {
			yield { error: `HTTP ${response.status}`, requestId, status: "error", type: "ai.request.end" };
			return;
		}

		yield { messageId, role: "assistant", type: "ai.message.start" };
		for await (const event of parseAnthropicStream({
			body: response.body,
			messageId,
			model: request.model,
			requestId,
		})) {
			yield event;
		}
		yield { requestId, status: "success", type: "ai.request.end" };
	}

	async estimateCost(request: UnifiedChatRequest, model: string): Promise<CostEstimate> {
		const descriptor = anthropicModels.find((item) => item.id === model || normalizeGatewayModel(this.id, item.id) === model);
		return estimateRequestCost(request, descriptor);
	}

	async healthcheck(ctx: ProviderContext): Promise<ProviderHealth> {
		const startedAt = ctx.now?.() ?? Date.now();
		const checkedAt = new Date(startedAt).toISOString();

		if (ctx.gateway) {
			const configured = Boolean(ctx.gateway.apiToken || ctx.apiKey);
			return {
				detail: configured ? "Anthropic AI Gateway route configured." : "Cloudflare API token or provider API key is not configured.",
				errorRate: configured ? 0 : 1,
				lastCheckedAt: checkedAt,
				latencyMs: elapsedMs(startedAt, ctx),
				status: configured ? "healthy" : "degraded",
			};
		}

		if (!ctx.apiKey) {
			return {
				detail: "Anthropic API key is not configured.",
				errorRate: 1,
				lastCheckedAt: checkedAt,
				latencyMs: elapsedMs(startedAt, ctx),
				status: "degraded",
			};
		}

		try {
			const response = await (ctx.fetch ?? fetch)("https://api.anthropic.com/v1/models", {
				headers: {
					"anthropic-version": anthropicVersion,
					"x-api-key": ctx.apiKey,
				},
				method: "GET",
				signal: ctx.signal,
			});

			return {
				detail: response.ok ? undefined : `Model listing returned HTTP ${response.status}.`,
				errorRate: response.ok ? 0 : 0.5,
				lastCheckedAt: checkedAt,
				latencyMs: elapsedMs(startedAt, ctx),
				status: response.ok ? "healthy" : "degraded",
			};
		} catch (error) {
			return {
				detail: error instanceof Error ? error.message : "Healthcheck failed.",
				errorRate: 1,
				lastCheckedAt: checkedAt,
				latencyMs: elapsedMs(startedAt, ctx),
				status: "down",
			};
		}
	}

	private async *streamCloudflareRest(request: UnifiedChatRequest, ctx: ProviderContext): AsyncIterable<UnifiedAiEvent> {
		const requestId = createId(ctx);
		const messageId = createId(ctx);
		const gateway = ctx.gateway;
		if (!gateway) {
			yield { error: "Cloudflare REST gateway config is required.", requestId, status: "error", type: "ai.request.end" };
			return;
		}

		const model = normalizeGatewayModel(this.id, request.model);
		yield { model, provider: this.id, requestId, type: "ai.request.start" };
		const response = await (ctx.fetch ?? fetch)(buildCloudflareRestUrl(gateway, "chat/completions"), {
			body: JSON.stringify(buildOpenAiPayload(request, model)),
			headers: {
				"Content-Type": "application/json",
				...buildCloudflareRestHeaders(gateway),
			},
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
			model,
			provider: this.id,
			requestId,
		})) {
			yield event;
		}
		yield { requestId, status: "success", type: "ai.request.end" };
	}
}

export async function* parseAnthropicStream(input: {
	body: ReadableStream<Uint8Array>;
	messageId: string;
	model: string;
	requestId: string;
}): AsyncIterable<UnifiedAiEvent> {
	let inputTokens = 0;
	let outputTokens = 0;
	let outputText = "";
	const toolArgs = new Map<string, string>();

	for await (const event of readServerSentEvents(input.body)) {
		const payload = parseJson(event.data);
		if (!payload) continue;

		const type = stringField(payload, "type") ?? event.event;
		if (type === "content_block_delta") {
			const delta = objectField(payload, "delta");
			const text = stringField(delta, "text");
			if (text) {
				outputText += text;
				yield { delta: text, messageId: input.messageId, type: "ai.text.delta" };
			}

			const partialJson = stringField(delta, "partial_json");
			const index = numberField(payload, "index") ?? 0;
			if (partialJson) {
				const toolCallId = `tool-${index}`;
				toolArgs.set(toolCallId, `${toolArgs.get(toolCallId) ?? ""}${partialJson}`);
				yield { argsDelta: partialJson, toolCallId, type: "ai.tool_call.delta" };
			}
		}

		if (type === "content_block_start") {
			const block = objectField(payload, "content_block");
			if (stringField(block, "type") === "tool_use") {
				const id = stringField(block, "id") ?? `tool-${numberField(payload, "index") ?? 0}`;
				const name = stringField(block, "name") ?? "tool";
				yield { argsPartial: objectField(block, "input"), name, toolCallId: id, type: "ai.tool_call.start" };
			}
		}

		const usage = parseUsage(payload);
		if (usage) {
			inputTokens = usage.inputTokens;
			outputTokens = usage.outputTokens;
		}
	}

	for (const [toolCallId, args] of toolArgs) {
		yield { args: parseJson(args) ?? args, toolCallId, type: "ai.tool_call.end" };
	}

	yield {
		inputTokens,
		model: input.model,
		outputTokens: outputTokens || Math.ceil(outputText.length / 4),
		provider: "anthropic",
		requestId: input.requestId,
		type: "ai.usage",
	};
	yield { messageId: input.messageId, outputText, type: "ai.message.end" };
}

type AnthropicEndpoint =
	| { headers: Record<string, string>; ok: true; url: string }
	| { error: string; ok: false };

function resolveAnthropicEndpoint(request: UnifiedChatRequest, ctx: ProviderContext): AnthropicEndpoint {
	if (ctx.gateway?.mode === "provider-native-gateway") {
		return {
			headers: buildProviderGatewayHeaders(ctx.gateway, { providerApiKey: ctx.apiKey, providerAuthHeader: "x-api-key" }),
			ok: true,
			url: buildProviderGatewayUrl(ctx.gateway, "anthropic", "v1/messages"),
		};
	}

	const baseUrl = ctx.baseUrl ?? "https://api.anthropic.com/v1";
	if (!ctx.apiKey) {
		return {
			error: `Native Anthropic calls require an API key for ${request.model}.`,
			ok: false,
		};
	}

	return {
		headers: { "x-api-key": ctx.apiKey },
		ok: true,
		url: `${baseUrl.replace(/\/+$/g, "")}/messages`,
	};
}

function buildAnthropicPayload(request: UnifiedChatRequest): Record<string, unknown> {
	const system = request.messages
		.filter((message) => message.role === "system")
		.map((message) => message.content)
		.join("\n\n");
	const messages = request.messages.filter((message) => message.role !== "system").map(toAnthropicMessage);

	return compactRecord({
		max_tokens: request.maxTokens ?? 4_096,
		messages,
		model: request.model,
		stream: request.stream,
		system: system || undefined,
		temperature: request.temperature,
		tools: request.tools?.map((tool) => ({
			description: tool.description,
			input_schema: tool.inputSchema,
			name: tool.name,
		})),
	});
}

function buildOpenAiPayload(request: UnifiedChatRequest, model: string): Record<string, unknown> {
	return compactRecord({
		max_tokens: request.maxTokens,
		messages: request.messages,
		model,
		stream: request.stream,
		temperature: request.temperature,
	});
}

function toAnthropicMessage(message: UnifiedChatMessage): { content: string; role: "assistant" | "user" } {
	return {
		content: message.content,
		role: message.role === "assistant" ? "assistant" : "user",
	};
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function createId(ctx: ProviderContext): string {
	return ctx.idFactory?.() ?? crypto.randomUUID();
}

function parseJson(value: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(value) as unknown;
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

function objectField(value: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
	const field = value?.[key];
	return field && typeof field === "object" && !Array.isArray(field) ? (field as Record<string, unknown>) : undefined;
}

function stringField(value: Record<string, unknown> | undefined, key: string): string | undefined {
	const field = value?.[key];
	return typeof field === "string" && field.length > 0 ? field : undefined;
}

function numberField(value: Record<string, unknown> | undefined, key: string): number | undefined {
	const field = value?.[key];
	return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

function elapsedMs(startedAt: number, ctx: ProviderContext): number {
	return Math.max(0, (ctx.now?.() ?? Date.now()) - startedAt);
}
