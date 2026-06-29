import { qwenModels } from "./catalog";
import { OpenAiCompatibleAdapter } from "./openai-compatible";

export class QwenAdapter extends OpenAiCompatibleAdapter {
	constructor() {
		super({
			gatewayProviderPath: "qwen",
			id: "qwen",
			models: qwenModels,
			providerSlug: "qwen",
			supportedModes: ["cloudflare-rest", "managed", "byok", "native"],
			title: "Qwen",
		});
	}
}
