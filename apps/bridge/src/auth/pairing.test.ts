import { describe, expect, it } from "vitest";

import { pairWithCloud } from "./pairing.js";

describe("pairWithCloud", () => {
	it("uses the shipped complete-pairing API contract", async () => {
		const requests: Array<{ body: unknown; url: string }> = [];
		const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
			requests.push({
				body: JSON.parse(String(init?.body)) as unknown,
				url: String(url),
			});
			return new Response(
				JSON.stringify({
					machine: { id: "machine-1", workspace_id: "workspace-1" },
					token: "signed-token",
				}),
				{ status: 201 },
			);
		}) as typeof fetch;

		const config = await pairWithCloud("pair-code", {
			agents: [
				{
					authStatus: "configured",
					capabilities: ["terminal"],
					command: "codex",
					kind: "codex",
					version: "1.2.3",
				},
			],
			cloudUrl: "http://localhost:3000/",
			displayName: "devbox",
			fetchImpl,
			now: () => new Date("2026-06-29T00:00:00.000Z"),
		});

		expect(requests).toHaveLength(1);
		expect(requests[0]?.url).toBe("http://localhost:3000/api/machines/complete-pairing");
		expect(requests[0]?.body).toMatchObject({
			agents: [{ command: "codex", kind: "codex" }],
			displayName: "devbox",
			pairingCode: "pair-code",
		});
		expect(config).toMatchObject({
			cloudUrl: "http://localhost:3000",
			displayName: "devbox",
			machineId: "machine-1",
			pairedAt: "2026-06-29T00:00:00.000Z",
			token: "signed-token",
			workspaceId: "workspace-1",
		});
	});

	it("rejects malformed pairing responses", async () => {
		const fetchImpl = (async () => new Response(JSON.stringify({ token: "" }), { status: 201 })) as typeof fetch;

		await expect(pairWithCloud("pair-code", { fetchImpl })).rejects.toThrow("Pairing response is invalid");
	});

	it("accepts camelCase workspace ids and rejects HTTP failures", async () => {
		const okFetch = (async () =>
			new Response(JSON.stringify({ machine: { id: "machine-1", workspaceId: "workspace-1" }, token: "token" }), {
				status: 201,
			})) as typeof fetch;
		const failedFetch = (async () => new Response("no", { status: 401, statusText: "Unauthorized" })) as typeof fetch;

		await expect(pairWithCloud("pair-code", { fetchImpl: okFetch })).resolves.toMatchObject({ workspaceId: "workspace-1" });
		await expect(pairWithCloud("pair-code", { fetchImpl: failedFetch })).rejects.toThrow("401");
	});

	it("rejects pairing responses without workspace identity", async () => {
		const fetchImpl = (async () =>
			new Response(JSON.stringify({ machine: { id: "machine-1" }, token: "token" }), { status: 201 })) as typeof fetch;

		await expect(pairWithCloud("pair-code", { fetchImpl })).rejects.toThrow("workspace id is missing");
	});
});
