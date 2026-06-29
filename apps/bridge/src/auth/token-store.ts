import type { BridgeConfig } from "../types.js";
import { loadConfig, saveConfig } from "../config.js";

export async function readBridgeToken(configPath?: string): Promise<string> {
	const config = await loadConfig(configPath);
	return config.token;
}

export async function writeBridgeToken(config: BridgeConfig, configPath?: string): Promise<void> {
	await saveConfig(config, configPath);
}
