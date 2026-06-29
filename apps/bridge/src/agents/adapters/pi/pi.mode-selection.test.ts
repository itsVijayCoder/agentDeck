import { describe, expect, it } from "vitest";

import { selectPiMode, type PiModeSelectionInput } from "./pi.mode-selection.js";

const base: PiModeSelectionInput = {
	bridgeRuntime: "node",
	isOneShotQueueJob: false,
	needsCustomAgentDeckTools: true,
	requiresProcessIsolation: false,
	requiresRealTerminal: false,
	requiresUserJumpIn: false,
};

describe("selectPiMode", () => {
	it("prefers PTY when terminal fidelity or jump-in control is required", () => {
		expect(selectPiMode({ ...base, requiresRealTerminal: true })).toBe("pty");
		expect(selectPiMode({ ...base, requiresUserJumpIn: true })).toBe("pty");
	});

	it("uses RPC for process isolation or non-node bridge runtimes", () => {
		expect(selectPiMode({ ...base, requiresProcessIsolation: true })).toBe("rpc");
		expect(selectPiMode({ ...base, bridgeRuntime: "tauri" })).toBe("rpc");
	});

	it("uses JSON for one-shot queue work without custom tools", () => {
		expect(selectPiMode({ ...base, isOneShotQueueJob: true, needsCustomAgentDeckTools: false })).toBe("json");
	});

	it("defaults to SDK mode for rich node bridge runs", () => {
		expect(selectPiMode(base)).toBe("sdk");
	});
});
