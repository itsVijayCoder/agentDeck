import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";

import type { BridgeConfig } from "./types.js";

const privacyModeSchema = z.enum(["local-only", "metadata-only", "full-sync"]);

export const bridgeConfigSchema = z
	.object({
		cloudUrl: z.string().url(),
		defaultSessionId: z.string().trim().min(1).optional(),
		displayName: z.string().trim().min(1),
		machineId: z.string().trim().min(1),
		pairedAt: z.iso.datetime(),
		privacyMode: privacyModeSchema.default("metadata-only"),
		token: z.string().trim().min(1),
		workspaceId: z.string().trim().min(1),
	})
	.strict();

export type BridgeConfigParseResult = z.infer<typeof bridgeConfigSchema>;

export function getAgentDeckHome(): string {
	return process.env.AGENTDECK_HOME ?? join(homedir(), ".agentdeck");
}

export function getConfigPath(configPath = process.env.AGENTDECK_CONFIG_PATH): string {
	return configPath ?? join(getAgentDeckHome(), "config.json");
}

export function getStatePath(statePath = process.env.AGENTDECK_STATE_PATH): string {
	return statePath ?? join(getAgentDeckHome(), "state.jsonl");
}

export async function loadConfig(configPath = getConfigPath()): Promise<BridgeConfig> {
	let raw: string;
	try {
		raw = await readFile(configPath, "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			throw new Error(`AgentDeck bridge is not paired. Run: agentdeck-bridge pair <pairing-code>`);
		}
		throw error;
	}

	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(raw) as unknown;
	} catch {
		throw new Error(`AgentDeck bridge config is not valid JSON: ${configPath}`);
	}

	const parsed = bridgeConfigSchema.safeParse(parsedJson);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`).join("; ");
		throw new Error(`AgentDeck bridge config is invalid: ${issues}`);
	}

	return parsed.data;
}

export async function saveConfig(config: BridgeConfig, configPath = getConfigPath()): Promise<void> {
	const parsed = bridgeConfigSchema.safeParse(config);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`).join("; ");
		throw new Error(`Cannot save invalid AgentDeck bridge config: ${issues}`);
	}

	await mkdir(dirname(configPath), { recursive: true });
	await writeFile(configPath, `${JSON.stringify(parsed.data, null, 2)}\n`, { mode: 0o600 });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
