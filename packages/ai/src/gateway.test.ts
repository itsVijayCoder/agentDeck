import { describe, expect, it } from "vitest";

import {
	buildCloudflareRestHeaders,
	buildCloudflareRestUrl,
	buildCompatGatewayUrl,
	buildProviderGatewayHeaders,
	buildProviderGatewayUrl,
	createGatewayConfig,
	describeDlpMode,
	normalizeGatewayModel,
} from "./gateway";

describe("AI Gateway helpers", () => {
	it("builds Cloudflare REST URLs and request control headers", () => {
		const config = createGatewayConfig({
			accountId: "acct 1",
			apiToken: "cf-token",
			dlpMode: "request-only",
			gatewayId: "prod",
		});
		config.cache = { cacheKey: "task-1", skip: true, ttlSeconds: 60 };
		config.collectLog = false;
		config.maxAttempts = 3;
		config.metadata = { runId: "run_1", workspaceId: "wrk_1" };
		config.requestTimeoutMs = 10_000;
		config.retryDelayMs = 250;
		config.backoff = "linear";

		expect(buildCloudflareRestUrl(config, "/chat/completions/")).toBe(
			"https://api.cloudflare.com/client/v4/accounts/acct%201/ai/v1/chat/completions",
		);
		expect(buildCloudflareRestHeaders(config)).toEqual({
			Authorization: "Bearer cf-token",
			"cf-aig-backoff": "linear",
			"cf-aig-cache-key": "task-1",
			"cf-aig-cache-ttl": "60",
			"cf-aig-collect-log": "false",
			"cf-aig-gateway-id": "prod",
			"cf-aig-max-attempts": "3",
			"cf-aig-metadata": "{\"runId\":\"run_1\",\"workspaceId\":\"wrk_1\"}",
			"cf-aig-request-timeout": "10000",
			"cf-aig-retry-delay": "250",
			"cf-aig-skip-cache": "true",
		});
	});

	it("builds provider-native and compatibility gateway URLs", () => {
		const config = createGatewayConfig({ accountId: "acct", gatewayId: "default" });

		expect(buildProviderGatewayUrl(config, "openai", "chat/completions")).toBe(
			"https://gateway.ai.cloudflare.com/v1/acct/default/openai/chat/completions",
		);
		expect(buildCompatGatewayUrl(config)).toBe("https://gateway.ai.cloudflare.com/v1/acct/default/compat/chat/completions");
	});

	it("builds provider-native gateway headers for BYOK and stored-key modes", () => {
		const config = createGatewayConfig({ accountId: "acct", apiToken: "cf-token" });

		expect(buildProviderGatewayHeaders(config, { providerApiKey: "provider-key" })).toMatchObject({
			Authorization: "Bearer provider-key",
			"cf-aig-authorization": "Bearer cf-token",
		});
		expect(buildProviderGatewayHeaders(config, { providerApiKey: "provider-key", providerAuthHeader: "x-api-key" })).toMatchObject({
			"cf-aig-authorization": "Bearer cf-token",
			"x-api-key": "provider-key",
		});
		expect(buildProviderGatewayHeaders(config)).toEqual({ "cf-aig-authorization": "Bearer cf-token" });
	});

	it("normalizes gateway model IDs and describes DLP modes", () => {
		expect(normalizeGatewayModel("openai", "gpt-4o-mini")).toBe("openai/gpt-4o-mini");
		expect(normalizeGatewayModel("openai", "anthropic/claude")).toBe("anthropic/claude");
		expect(normalizeGatewayModel("workers-ai", "@cf/meta/llama")).toBe("@cf/meta/llama");
		expect(describeDlpMode("request-and-response")).toContain("buffered");
		expect(describeDlpMode("request-only")).toContain("latency is preserved");
		expect(describeDlpMode("off")).toContain("not configured");
	});
});
