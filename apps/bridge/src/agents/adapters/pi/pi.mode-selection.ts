export type PiRunMode = "sdk" | "rpc" | "json" | "pty";

export type PiModeSelectionInput = {
	bridgeRuntime: "go" | "node" | "rust" | "tauri";
	isOneShotQueueJob: boolean;
	needsCustomAgentDeckTools: boolean;
	requiresProcessIsolation: boolean;
	requiresRealTerminal: boolean;
	requiresUserJumpIn: boolean;
};

export function selectPiMode(input: PiModeSelectionInput): PiRunMode {
	if (input.requiresRealTerminal || input.requiresUserJumpIn) {
		return "pty";
	}

	if (input.requiresProcessIsolation || input.bridgeRuntime !== "node") {
		return "rpc";
	}

	if (input.isOneShotQueueJob && !input.needsCustomAgentDeckTools) {
		return "json";
	}

	return "sdk";
}
