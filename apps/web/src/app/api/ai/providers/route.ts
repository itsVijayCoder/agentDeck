import { createDefaultProviderRegistry } from "@agentdeck/ai";

import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { getAiGatewayRuntimeConfig } from "@/lib/ai-gateway-config";
import { requireSession } from "@/lib/auth";

export async function GET() {
	return withApiErrors(async () => {
		await requireSession();

		const gateway = getAiGatewayRuntimeConfig();
		const registry = createDefaultProviderRegistry();
		const providers = await Promise.all(
			registry.list().map(async (adapter) => ({
				displayName: adapter.displayName,
				id: adapter.id,
				models: (await adapter.listModels({})).map((model) => ({
					contextWindow: model.contextWindow,
					displayName: model.displayName,
					id: model.id,
					maxOutputTokens: model.maxOutputTokens,
					supportsStreaming: model.supportsStreaming,
					supportsToolCalls: model.supportsToolCalls,
					supportsVision: model.supportsVision,
				})),
				supportedModes: adapter.supportedModes,
				supportedWireApis: adapter.supportedWireApis,
			})),
		);

		return jsonResponse({
			gateway: {
				configured: gateway.configured,
				description: gateway.description,
				dlpMode: gateway.dlpMode,
				gatewayId: gateway.gatewayId,
				missing: gateway.missing,
				mode: gateway.mode,
			},
			providers,
		});
	});
}
