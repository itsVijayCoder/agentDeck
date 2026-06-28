import { describe, expect, it } from "vitest";

import { SESSION_HUB_RECENT_EVENT_LIMIT, isSessionHubClientRole } from "./index";

describe("bridge protocol session hub contract", () => {
	it("recognizes supported websocket roles", () => {
		expect(isSessionHubClientRole("browser")).toBe(true);
		expect(isSessionHubClientRole("bridge")).toBe(true);
		expect(isSessionHubClientRole("observer")).toBe(true);
		expect(isSessionHubClientRole("admin")).toBe(false);
		expect(isSessionHubClientRole(null)).toBe(false);
	});

	it("keeps the replay cache limit aligned with Phase 03", () => {
		expect(SESSION_HUB_RECENT_EVENT_LIMIT).toBe(500);
	});
});
