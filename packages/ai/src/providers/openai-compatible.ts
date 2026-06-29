import { estimateRequestCost } from "../cost-tracker";
import {
	buildCloudflareRestHeaders,
	buildCloudflareRestUrl,
	buildProviderGatewayHeaders,
	buildProviderGatewayUrl,
	normalizeGatewayModel,
} from "../gateway";
import { parseOpenAiChatStream } from "../sse";
import type {
	CostEstimate,
	LlmProviderAdapter,
	LlmProviderId,
	ModelDescriptor,
	ProviderContext,
	ProviderHealth,
	ProviderMode,
	UnifiedAiEvent,
	UnifiedChatRequest,
	WireApi,
} from "../types";

export type OpenAiCompatibleProviderConfig = {
	defaultBaseUrl?: string;
	gatewayProviderPath?: string;
	id: LlmProviderId | string;
	models: readonly ModelDescriptor[];
	nativeChatPath?: string;
	providerSlug: string;
	supportedModes?: readonly ProviderMode[];
	supportedWireApis?: readonly WireApi[];
	title: string;
};

export class OpenAiCompatibleAdapter implements LlmProviderAdapter {
	readonly displayName: string;
	readonly id: LlmProviderId | string;
	readonly supportedModes: readonly ProviderMode[];
	readonly supportedWireApis: readonly WireApi[];
	protected readonly config: OpenAiCompatibleProviderConfig;

	constructor(config: OpenAiCompatibleProviderConfig) {
		this.config = config;
		this.displayName = config.title;
		this.id = config.id;
		this.supportedModes = config.supportedModes ?? ["native", "cloudflare-gateway", "cloudflare-rest", "byok", "managed"];
		this.supportedWireApis = config.supportedWireApis ?? ["openai-chat"];
	}

	async listModels(): Promise<ModelDescriptor[]> {
		return this.config.models.map((model) => ({ ...model }));
	}

	async *streamChat(request: UnifiedChatRequest, ctx: ProviderContext): AsyncIterable<UnifiedAiEvent> {
		const requestId = createId(ctx);
		const messageId = createId(ctx);
		const endpoint = resolveOpenAiCompatibleEndpoint(this.config, request, ctx);
		const model = endpoint.model;

		yield { model, provider: this.id, requestId, type: "ai.request.start" };

		if (!endpoint.ok) {
			yield { error: endpoint.error, requestId, status: "error", type: "ai.request.end" };
			return;
		}

		const fetcher = ctx.fetch ?? fetch;
		const response = await fetcher(endpoint.url, {
			body: JSON.stringify(buildOpenAiChatPayload(request, model)),
			headers: {
				"Content-Type": "application/json",
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

	async estimateCost(request: UnifiedChatRequest, model: string): Promise<CostEstimate> {
		const descriptor = this.config.models.find((item) => item.id === model || normalizeGatewayModel(this.config.providerSlug, item.id) === model);
		return estimateRequestCost(request, descriptor);
	}

	async healthcheck(ctx: ProviderContext): Promise<ProviderHealth> {
		const startedAt = ctx.now?.() ?? Date.now();
		const checkedAt = new Date(startedAt).toISOString();

		if (ctx.gateway?.mode === "cloudflare-rest") {
			return healthFromConfig(Boolean(ctx.gateway.apiToken), startedAt, ctx, "Cloudflare REST AI Gateway route configured.");
		}

		if (ctx.gateway?.mode === "provider-native-gateway") {
			return healthFromConfig(Boolean(ctx.gateway.apiToken || ctx.apiKey), startedAt, ctx, "Provider-native AI Gateway route configured.");
		}

		if (!ctx.apiKey) {
			return {
				detail: "Provider API key is not configured.",
				errorRate: 1,
				lastCheckedAt: checkedAt,
				latencyMs: elapsedMs(startedAt, ctx),
				status: "degraded",
			};
		}

		const modelsUrl = resolveModelsUrl(this.config, ctx);
		if (!modelsUrl) {
			return {
				detail: "No native model listing endpoint is configured for this provider.",
				errorRate: 0,
				lastCheckedAt: checkedAt,
				latencyMs: elapsedMs(startedAt, ctx),
				status: "healthy",
			};
		}

		try {
			const fetcher = ctx.fetch ?? fetch;
			const response = await fetcher(modelsUrl, {
				headers: { Authorization: `Bearer ${ctx.apiKey}` },
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
}

type EndpointResolution =
	| { headers: Record<string, string>; model: string; ok: true; url: string }
	| { error: string; model: string; ok: false };

export function resolveOpenAiCompatibleEndpoint(
	config: OpenAiCompatibleProviderConfig,
	request: UnifiedChatRequest,
	ctx: ProviderContext,
): EndpointResolution {
	const nativePath = config.nativeChatPath ?? "chat/completions";
	if (ctx.gateway?.mode === "cloudflare-rest") {
		const model = normalizeGatewayModel(config.providerSlug, request.model);
		return {
			headers: buildCloudflareRestHeaders(ctx.gateway),
			model,
			ok: true,
			url: buildCloudflareRestUrl(ctx.gateway, "chat/completions"),
		};
	}

	if (ctx.gateway?.mode === "provider-native-gateway") {
		const model = request.model;
		return {
			headers: buildProviderGatewayHeaders(ctx.gateway, { providerApiKey: ctx.apiKey }),
			model,
			ok: true,
			url: buildProviderGatewayUrl(ctx.gateway, config.gatewayProviderPath ?? config.providerSlug, nativePath),
		};
	}

	const baseUrl = ctx.baseUrl ?? config.defaultBaseUrl;
	if (!baseUrl) {
		return {
			error: `Native ${config.title} calls require a base URL or Cloudflare AI Gateway.`,
			model: request.model,
			ok: false,
		};
	}
	if (!ctx.apiKey && !ctx.baseUrl) {
		return {
			error: `Native ${config.title} calls require an API key, a custom base URL, or Cloudflare AI Gateway.`,
			model: request.model,
			ok: false,
		};
	}

	return {
		headers: ctx.apiKey ? { Authorization: `Bearer ${ctx.apiKey}` } : {},
		model: request.model,
		ok: true,
		url: `${baseUrl.replace(/\/+$/g, "")}/${nativePath}`,
	};
}

export function buildOpenAiChatPayload(request: UnifiedChatRequest, model: string): Record<string, unknown> {
	return compactRecord({
		max_tokens: request.maxTokens,
		messages: request.messages.map((message) => ({
			content: message.content,
			role: message.role,
			...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
		})),
		model,
		stream: request.stream,
		temperature: request.temperature,
		tools: request.tools?.map((tool) => ({
			function: {
				description: tool.description,
				name: tool.name,
				parameters: tool.inputSchema,
			},
			type: "function",
		})),
	});
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function createId(ctx: ProviderContext): string {
	return ctx.idFactory?.() ?? crypto.randomUUID();
}

function resolveModelsUrl(config: OpenAiCompatibleProviderConfig, ctx: ProviderContext): string | null {
	const baseUrl = ctx.baseUrl ?? config.defaultBaseUrl;
	if (!baseUrl) {
		return null;
	}

	return `${baseUrl.replace(/\/+$/g, "")}/models`;
}

function healthFromConfig(configured: boolean, startedAt: number, ctx: ProviderContext, detail: string): ProviderHealth {
	return {
		detail: configured ? detail : "Cloudflare API token is not configured.",
		errorRate: configured ? 0 : 1,
		lastCheckedAt: new Date(startedAt).toISOString(),
		latencyMs: elapsedMs(startedAt, ctx),
		status: configured ? "healthy" : "degraded",
	};
}

function elapsedMs(startedAt: number, ctx: ProviderContext): number {
	return Math.max(0, (ctx.now?.() ?? Date.now()) - startedAt);
}
