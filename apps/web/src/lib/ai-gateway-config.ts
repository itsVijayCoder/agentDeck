import {
	createGatewayConfig,
	describeDlpMode,
	type DlpMode,
	type GatewayConfig,
	type GatewayTransportMode,
} from "@agentdeck/ai";

export type AiGatewayRuntimeConfig = {
	config?: GatewayConfig;
	configured: boolean;
	description: string;
	dlpMode: DlpMode;
	gatewayId: string;
	missing: string[];
	mode: GatewayTransportMode;
};

export function getAiGatewayRuntimeConfig(env: NodeJS.ProcessEnv = process.env): AiGatewayRuntimeConfig {
	const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
	const apiToken = env.CLOUDFLARE_API_TOKEN?.trim() || env.CLOUDFLARE_API_KEY?.trim();
	const gatewayId = env.CLOUDFLARE_GATEWAY_ID?.trim() || "default";
	const dlpMode = parseDlpMode(env.AGENTDECK_AI_DLP_MODE);
	const mode = parseGatewayMode(env.AGENTDECK_AI_GATEWAY_MODE);
	const missing = [
		...(accountId ? [] : ["CLOUDFLARE_ACCOUNT_ID"]),
		...(apiToken ? [] : ["CLOUDFLARE_API_TOKEN or CLOUDFLARE_API_KEY"]),
	];

	return {
		...(accountId
			? {
					config: createGatewayConfig({
						accountId,
						apiToken,
						dlpMode,
						gatewayId,
						mode,
					}),
				}
			: {}),
		configured: missing.length === 0,
		description: describeDlpMode(dlpMode),
		dlpMode,
		gatewayId,
		missing,
		mode,
	};
}

function parseDlpMode(value: string | undefined): DlpMode {
	if (value === "request-only" || value === "request-and-response" || value === "off") {
		return value;
	}

	return "off";
}

function parseGatewayMode(value: string | undefined): GatewayTransportMode {
	if (value === "provider-native-gateway") {
		return "provider-native-gateway";
	}

	return "cloudflare-rest";
}
