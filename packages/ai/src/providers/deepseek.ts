import { deepSeekModels } from "./catalog";
import { OpenAiCompatibleAdapter } from "./openai-compatible";

export class DeepSeekAdapter extends OpenAiCompatibleAdapter {
	constructor() {
		super({
			defaultBaseUrl: "https://api.deepseek.com",
			gatewayProviderPath: "deepseek",
			id: "deepseek",
			models: deepSeekModels,
			nativeChatPath: "chat/completions",
			providerSlug: "deepseek",
			title: "DeepSeek",
		});
	}
}
