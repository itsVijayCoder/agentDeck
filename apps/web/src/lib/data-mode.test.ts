import { afterEach, describe, expect, it, vi } from "vitest";

import { getAgentDeckDataMode, isLiveDataMode } from "./data-mode";

describe("AgentDeck data mode", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("defaults to live mode", () => {
		vi.stubEnv("NEXT_PUBLIC_AGENTDECK_DATA_MODE", "");
		vi.stubEnv("AGENTDECK_DATA_MODE", "");

		expect(getAgentDeckDataMode()).toBe("live");
		expect(isLiveDataMode()).toBe(true);
	});

	it("allows explicit mock mode for demos", () => {
		vi.stubEnv("NEXT_PUBLIC_AGENTDECK_DATA_MODE", "mock");

		expect(getAgentDeckDataMode()).toBe("mock");
		expect(isLiveDataMode()).toBe(false);
	});
});
