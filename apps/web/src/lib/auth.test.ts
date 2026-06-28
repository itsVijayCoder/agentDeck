import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	generateBridgeConnectionToken,
	generatePairingCode,
	openSessionCookie,
	sealSessionCookie,
	verifyBridgeConnectionToken,
	verifyPairingCode,
} from "./auth";

const user = {
	role: "owner" as const,
	userId: "user_01",
	workspaceId: "ws_01",
};

describe("OpenFusion API auth tokens", () => {
	beforeEach(() => {
		vi.stubEnv("OPENFUSION_SESSION_SECRET", "test-secret-with-enough-entropy-for-hmac-signing");
	});

	it("round-trips signed session cookies", async () => {
		const cookie = await sealSessionCookie(user, 1000);

		await expect(openSessionCookie(cookie, 2000)).resolves.toEqual(user);
	});

	it("rejects tampered and expired session cookies", async () => {
		const cookie = await sealSessionCookie(user, 1000);

		await expect(openSessionCookie(`${cookie}x`, 2000)).resolves.toBeNull();
		await expect(openSessionCookie(cookie, 1000 + 60 * 60 * 24 * 8 * 1000)).resolves.toBeNull();
	});

	it("round-trips expiring bridge pairing codes", async () => {
		const pairingCode = await generatePairingCode(user, 1000);

		await expect(verifyPairingCode(pairingCode, 2000)).resolves.toMatchObject({
			purpose: "bridge-pairing",
			requestedBy: user.userId,
			workspaceId: user.workspaceId,
		});
		await expect(verifyPairingCode(pairingCode, 1000 + 1000 * 60 * 11)).resolves.toBeNull();
	});

	it("round-trips bridge connection tokens scoped to a machine", async () => {
		const token = await generateBridgeConnectionToken({ machineId: "machine_01", workspaceId: user.workspaceId }, 1000);

		await expect(verifyBridgeConnectionToken(token, 2000)).resolves.toMatchObject({
			machineId: "machine_01",
			purpose: "bridge-connection",
			workspaceId: user.workspaceId,
		});
		await expect(verifyBridgeConnectionToken(token, 1000 + 1000 * 60 * 60 * 24 * 31)).resolves.toBeNull();
	});
});
