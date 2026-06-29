import type { GatewayConfig } from "./types";

const defaultGatewayId = "default";
const cloudflareGatewayBaseUrl = "https://gateway.ai.cloudflare.com/v1";
const cloudflareApiBaseUrl = "https://api.cloudflare.com/client/v4";

export function createGatewayConfig(input: {
	accountId: string;
	apiToken?: string;
	dlpMode?: GatewayConfig["dlpMode"];
	gatewayId?: string;
	mode?: GatewayConfig["mode"];
}): GatewayConfig {
	return {
		accountId: input.accountId,
		...(input.apiToken ? { apiToken: input.apiToken } : {}),
		dlpMode: input.dlpMode ?? "off",
		gatewayId: input.gatewayId ?? defaultGatewayId,
		mode: input.mode ?? "cloudflare-rest",
	};
}

export function buildCloudflareRestUrl(config: Pick<GatewayConfig, "accountId">, path: string): string {
	const normalizedPath = trimSlashes(path);
	return `${cloudflareApiBaseUrl}/accounts/${encodeURIComponent(config.accountId)}/ai/v1/${normalizedPath}`;
}

export function buildProviderGatewayUrl(
	config: Pick<GatewayConfig, "accountId" | "gatewayId">,
	provider: string,
	path: string,
): string {
	const normalizedPath = trimSlashes(path);
	return `${cloudflareGatewayBaseUrl}/${encodeURIComponent(config.accountId)}/${encodeURIComponent(config.gatewayId)}/${provider}/${normalizedPath}`;
}

export function buildCompatGatewayUrl(config: Pick<GatewayConfig, "accountId" | "gatewayId">, path = "chat/completions"): string {
	const normalizedPath = trimSlashes(path);
	return `${cloudflareGatewayBaseUrl}/${encodeURIComponent(config.accountId)}/${encodeURIComponent(config.gatewayId)}/compat/${normalizedPath}`;
}

export function buildCloudflareRestHeaders(config: GatewayConfig): Record<string, string> {
	const headers: Record<string, string> = {};
	if (config.apiToken) {
		headers.Authorization = `Bearer ${config.apiToken}`;
	}

	headers["cf-aig-gateway-id"] = config.gatewayId;
	addRequestControlHeaders(headers, config);
	return headers;
}

export function buildProviderGatewayHeaders(
	config: GatewayConfig,
	input: { providerApiKey?: string; providerAuthHeader?: "Authorization" | "x-api-key" } = {},
): Record<string, string> {
	const headers: Record<string, string> = {};
	if (config.apiToken) {
		headers["cf-aig-authorization"] = `Bearer ${config.apiToken}`;
	}

	if (input.providerApiKey) {
		const headerName = input.providerAuthHeader ?? "Authorization";
		headers[headerName] = headerName === "Authorization" ? `Bearer ${input.providerApiKey}` : input.providerApiKey;
	}

	addRequestControlHeaders(headers, config);
	return headers;
}

export function normalizeGatewayModel(provider: string, model: string): string {
	if (model.includes("/") || model.startsWith("@cf/")) {
		return model;
	}

	return `${provider}/${model}`;
}

export function describeDlpMode(mode: GatewayConfig["dlpMode"]): string {
	switch (mode) {
		case "request-and-response":
			return "Gateway-level request and response scanning. Streaming responses may be buffered by Cloudflare DLP.";
		case "request-only":
			return "Gateway-level request scanning only. Streaming response latency is preserved.";
		case "off":
			return "AI Gateway DLP is not configured for this route.";
	}
}

function addRequestControlHeaders(headers: Record<string, string>, config: GatewayConfig): void {
	if (config.cache?.ttlSeconds !== undefined) {
		headers["cf-aig-cache-ttl"] = String(config.cache.ttlSeconds);
	}
	if (config.cache?.cacheKey) {
		headers["cf-aig-cache-key"] = config.cache.cacheKey;
	}
	if (config.cache?.skip !== undefined) {
		headers["cf-aig-skip-cache"] = String(config.cache.skip);
	}
	if (config.collectLog !== undefined) {
		headers["cf-aig-collect-log"] = String(config.collectLog);
	}
	if (config.requestTimeoutMs !== undefined) {
		headers["cf-aig-request-timeout"] = String(config.requestTimeoutMs);
	}
	if (config.maxAttempts !== undefined) {
		headers["cf-aig-max-attempts"] = String(config.maxAttempts);
	}
	if (config.retryDelayMs !== undefined) {
		headers["cf-aig-retry-delay"] = String(config.retryDelayMs);
	}
	if (config.backoff) {
		headers["cf-aig-backoff"] = config.backoff;
	}
	if (config.metadata) {
		headers["cf-aig-metadata"] = JSON.stringify(config.metadata);
	}
}

function trimSlashes(value: string): string {
	return value.replace(/^\/+|\/+$/g, "");
}
