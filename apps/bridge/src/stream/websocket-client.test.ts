import { describe, expect, it } from "vitest";

import { buildSessionHubWebSocketUrl } from "./websocket-client.js";
import type { BridgeConfig } from "../types.js";

const config: BridgeConfig = {
	cloudUrl: "https://agentdeck.example",
	displayName: "devbox",
	machineId: "machine 1",
	pairedAt: "2026-06-29T00:00:00.000Z",
	privacyMode: "metadata-only",
	token: "signed.token",
	workspaceId: "workspace-1",
};

describe("buildSessionHubWebSocketUrl", () => {
	it("builds the Phase 03 session-scoped bridge URL", () => {
		const url = new URL(buildSessionHubWebSocketUrl(config, "session/one", 4));

		expect(url.protocol).toBe("wss:");
		expect(url.pathname).toBe("/api/sessions/session%2Fone/ws");
		expect(url.searchParams.get("role")).toBe("bridge");
		expect(url.searchParams.get("machineId")).toBe("machine 1");
		expect(url.searchParams.get("token")).toBe("signed.token");
		expect(url.searchParams.get("lastSeq")).toBe("4");
	});

	it("uses ws for http development URLs", () => {
		const url = new URL(buildSessionHubWebSocketUrl({ ...config, cloudUrl: "http://localhost:3000" }, "session-1"));

		expect(url.protocol).toBe("ws:");
		expect(url.searchParams.get("lastSeq")).toBeNull();
	});
});
