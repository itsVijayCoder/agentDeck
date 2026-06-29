import { googleModels } from "./catalog";
import { OpenAiCompatibleAdapter } from "./openai-compatible";

export class GoogleAdapter extends OpenAiCompatibleAdapter {
	constructor() {
		super({
			gatewayProviderPath: "google",
			id: "google",
			models: googleModels,
			providerSlug: "google",
			supportedModes: ["cloudflare-rest", "managed", "byok"],
			supportedWireApis: ["openai-chat", "google-generate"],
			title: "Google",
		});
	}
}
