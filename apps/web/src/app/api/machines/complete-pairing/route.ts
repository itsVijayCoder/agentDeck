import type { NextRequest } from "next/server";

import { writeAudit } from "@agentdeck/db";

import { jsonResponse, unauthorized, withApiErrors } from "@/lib/api/errors";
import { parseJsonRequest } from "@/lib/api/request";
import { completePairingRequestSchema } from "@/lib/api/schemas";
import { generateBridgeConnectionToken, verifyPairingCode } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function POST(request: NextRequest) {
	return withApiErrors(async () => {
		const body = await parseJsonRequest(request, completePairingRequestSchema);
		const pairing = await verifyPairingCode(body.pairingCode);
		if (!pairing) {
			unauthorized("Pairing code is invalid or expired.");
		}

		const repositories = await getRepositories();
		const now = new Date().toISOString();
		const machine = await repositories.machines.upsert({
			arch: body.arch,
			bridgeVersion: body.bridgeVersion,
			displayName: body.displayName,
			id: body.machineId ?? crypto.randomUUID(),
			lastSeenAt: now,
			os: body.os,
			status: "online",
			updatedAt: now,
			workspaceId: pairing.workspaceId,
		});

		const agents = await Promise.all(
			body.agents.map((agent) =>
				repositories.agentInstallations.upsert({
					agentKind: agent.kind,
					authStatus: agent.authStatus,
					capabilities: agent.capabilities,
					command: agent.command,
					id: agent.id ?? crypto.randomUUID(),
					machineId: machine.id,
					updatedAt: now,
					version: agent.version,
				}),
			),
		);
		const token = await generateBridgeConnectionToken({ machineId: machine.id, workspaceId: pairing.workspaceId });
		await writeAudit(repositories, {
			action: "machine.paired",
			actorId: pairing.requestedBy,
			details: { agentCount: agents.length, bridgeVersion: machine.bridge_version, displayName: machine.display_name },
			resourceId: machine.id,
			resourceType: "machine",
			workspaceId: pairing.workspaceId,
		});

		return jsonResponse({ agents, machine, token }, { status: 201 });
	});
}
