import { openRouterModels } from "./catalog";
import { OpenAiCompatibleAdapter } from "./openai-compatible";

export class OpenRouterAdapter extends OpenAiCompatibleAdapter {
	constructor() {
		super({
			defaultBaseUrl: "https://openrouter.ai/api/v1",
			gatewayProviderPath: "openrouter",
			id: "openrouter",
			models: openRouterModels,
			nativeChatPath: "chat/completions",
			providerSlug: "openrouter",
			title: "OpenRouter",
		});
	}
}
