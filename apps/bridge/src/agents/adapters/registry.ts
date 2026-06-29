import { AdapterRegistry } from "@agentdeck/harness";

import { PtyManager } from "../../pty/pty-manager.js";
import type { TerminalSessionRegistry } from "../../pty/terminal-control.js";
import { AcpAdapter } from "./acp.adapter.js";
import { AiderAdapter } from "./aider.adapter.js";
import { ClaudeCodeAdapter } from "./claude-code.adapter.js";
import { CodexAdapter } from "./codex.adapter.js";
import { OpenCodeAdapter } from "./opencode.adapter.js";
import { PiAdapter } from "./pi/pi.adapter.js";
import { QwenCodeAdapter } from "./qwen-code.adapter.js";

export type BridgeAdapterRegistryOptions = {
	ptyManager?: PtyManager;
	terminalSessions?: TerminalSessionRegistry;
};

export function createBridgeAdapterRegistry(options: BridgeAdapterRegistryOptions = {}): AdapterRegistry {
	const ptyManager = options.ptyManager ?? new PtyManager();
	const registry = new AdapterRegistry();

	registry.register(new ClaudeCodeAdapter(ptyManager, options.terminalSessions));
	registry.register(new CodexAdapter(ptyManager, options.terminalSessions));
	registry.register(new OpenCodeAdapter(ptyManager, options.terminalSessions));
	registry.register(new QwenCodeAdapter(ptyManager, options.terminalSessions));
	registry.register(new PiAdapter(ptyManager, options.terminalSessions));
	registry.register(new AiderAdapter(ptyManager, options.terminalSessions));
	registry.register(new AcpAdapter());

	return registry;
}

export async function probeBridgeAdapters(registry = createBridgeAdapterRegistry()) {
	return Promise.all(registry.list().map((adapter) => adapter.probe()));
}
