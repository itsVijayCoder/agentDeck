import { arch, hostname, platform } from "node:os";
import { z } from "zod";

import { BRIDGE_VERSION, type BridgeConfig, type DetectedAgentForPairing } from "../types.js";

export type PairWithCloudOptions = {
	agents?: DetectedAgentForPairing[];
	cloudUrl?: string;
	displayName?: string;
	fetchImpl?: typeof fetch;
	machineId?: string;
	now?: () => Date;
	privacyMode?: BridgeConfig["privacyMode"];
};

const machineResponseSchema = z
	.object({
		id: z.string().trim().min(1),
		workspace_id: z.string().trim().min(1).optional(),
		workspaceId: z.string().trim().min(1).optional(),
	})
	.passthrough();

const completePairingResponseSchema = z
	.object({
		machine: machineResponseSchema,
		token: z.string().trim().min(1),
	})
	.passthrough();

export async function pairWithCloud(pairingCode: string, options: PairWithCloudOptions = {}): Promise<BridgeConfig> {
	const cloudUrl = normalizeCloudUrl(options.cloudUrl ?? process.env.AGENTDECK_CLOUD_URL ?? "http://localhost:3000");
	const displayName = options.displayName ?? hostname();
	const fetchImpl = options.fetchImpl ?? fetch;
	const response = await fetchImpl(`${cloudUrl}/api/machines/complete-pairing`, {
		body: JSON.stringify({
			agents: options.agents ?? [],
			arch: arch(),
			bridgeVersion: BRIDGE_VERSION,
			displayName,
			...(options.machineId ? { machineId: options.machineId } : {}),
			os: platform(),
			pairingCode,
		}),
		headers: { "Content-Type": "application/json" },
		method: "POST",
	});

	if (!response.ok) {
		throw new Error(`Pairing failed with ${response.status}: ${response.statusText || "AgentDeck cloud rejected the code"}`);
	}

	const json = (await response.json()) as unknown;
	const parsed = completePairingResponseSchema.safeParse(json);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "response"}: ${issue.message}`).join("; ");
		throw new Error(`Pairing response is invalid: ${issues}`);
	}

	const workspaceId = parsed.data.machine.workspace_id ?? parsed.data.machine.workspaceId;
	if (!workspaceId) {
		throw new Error("Pairing response is invalid: machine workspace id is missing.");
	}

	return {
		cloudUrl,
		displayName,
		machineId: parsed.data.machine.id,
		pairedAt: (options.now ?? (() => new Date()))().toISOString(),
		privacyMode: options.privacyMode ?? "metadata-only",
		token: parsed.data.token,
		workspaceId,
	};
}

function normalizeCloudUrl(value: string): string {
	return value.replace(/\/+$/u, "");
}
