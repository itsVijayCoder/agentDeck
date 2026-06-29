import { openAiModels } from "./catalog";
import { OpenAiCompatibleAdapter } from "./openai-compatible";

export class OpenAIAdapter extends OpenAiCompatibleAdapter {
	constructor() {
		super({
			defaultBaseUrl: "https://api.openai.com/v1",
			gatewayProviderPath: "openai",
			id: "openai",
			models: openAiModels,
			nativeChatPath: "chat/completions",
			providerSlug: "openai",
			supportedWireApis: ["openai-chat", "openai-responses"],
			title: "OpenAI",
		});
	}
}
