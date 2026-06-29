export const llmProviderIds = ["openai", "anthropic", "google", "qwen", "deepseek", "ollama", "openrouter"] as const;

export type LlmProviderId = (typeof llmProviderIds)[number];

export type WireApi =
	| "openai-chat"
	| "openai-responses"
	| "anthropic-messages"
	| "google-generate"
	| "ollama-chat"
	| "custom";

export type ProviderMode = "native" | "cloudflare-gateway" | "cloudflare-rest" | "byok" | "managed" | "local";

export type DlpMode = "off" | "request-only" | "request-and-response";

export type GatewayRequestBackoff = "constant" | "linear" | "exponential";

export type GatewayTransportMode = "cloudflare-rest" | "provider-native-gateway";

export type GatewayConfig = {
	accountId: string;
	apiToken?: string;
	backoff?: GatewayRequestBackoff;
	cache?: {
		cacheKey?: string;
		enabled?: boolean;
		skip?: boolean;
		ttlSeconds?: number;
	};
	collectLog?: boolean;
	dlpMode: DlpMode;
	gatewayId: string;
	maxAttempts?: number;
	metadata?: Record<string, string | number | boolean>;
	mode: GatewayTransportMode;
	requestTimeoutMs?: number;
	retryDelayMs?: number;
};

export type ModelDescriptor = {
	contextWindow?: number;
	costPerMtokInput?: number;
	costPerMtokOutput?: number;
	displayName: string;
	id: string;
	maxOutputTokens?: number;
	provider: LlmProviderId | string;
	supportsStreaming: boolean;
	supportsToolCalls: boolean;
	supportsVision: boolean;
};

export type ProviderContext = {
	apiKey?: string;
	baseUrl?: string;
	fetch?: FetchLike;
	gateway?: GatewayConfig;
	idFactory?: () => string;
	now?: () => number;
	signal?: AbortSignal;
};

export type UnifiedChatMessage = {
	content: string;
	role: "assistant" | "system" | "tool" | "user";
	toolCallId?: string;
};

export type UnifiedToolDefinition = {
	description: string;
	inputSchema: unknown;
	name: string;
};

export type UnifiedChatRequest = {
	maxTokens?: number;
	messages: UnifiedChatMessage[];
	model: string;
	stream: boolean;
	temperature?: number;
	tools?: UnifiedToolDefinition[];
};

export type CostEstimate = {
	costUsd: number;
	inputTokens: number;
	outputTokens: number;
};

export type ProviderHealth = {
	detail?: string;
	errorRate: number;
	lastCheckedAt: string;
	latencyMs: number;
	status: "degraded" | "down" | "healthy";
};

export type UnifiedAiEvent =
	| { model: string; provider: string; requestId: string; type: "ai.request.start" }
	| { messageId: string; role: "assistant"; type: "ai.message.start" }
	| { delta: string; messageId: string; type: "ai.text.delta" }
	| { delta: string; messageId: string; type: "ai.thinking.delta"; visibility: "hidden" | "summary" }
	| { argsPartial?: unknown; name: string; toolCallId: string; type: "ai.tool_call.start" }
	| { argsDelta: string; toolCallId: string; type: "ai.tool_call.delta" }
	| { args: unknown; toolCallId: string; type: "ai.tool_call.end" }
	| { messageId: string; outputText?: string; type: "ai.message.end" }
	| {
			costUsd?: number;
			inputTokens: number;
			model: string;
			outputTokens: number;
			provider: string;
			requestId: string;
			type: "ai.usage";
	  }
	| { error?: string; requestId: string; status: "error" | "success"; type: "ai.request.end" };

export interface LlmProviderAdapter {
	readonly displayName: string;
	readonly id: LlmProviderId | string;
	readonly supportedModes: readonly ProviderMode[];
	readonly supportedWireApis: readonly WireApi[];

	estimateCost(request: UnifiedChatRequest, model: string): Promise<CostEstimate>;
	healthcheck(ctx: ProviderContext): Promise<ProviderHealth>;
	listModels(ctx: ProviderContext): Promise<ModelDescriptor[]>;
	streamChat(request: UnifiedChatRequest, ctx: ProviderContext): AsyncIterable<UnifiedAiEvent>;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class AiProviderError extends Error {
	constructor(
		message: string,
		readonly provider: string,
		readonly status?: number,
		readonly retryable = true,
	) {
		super(message);
		this.name = "AiProviderError";
	}
}
