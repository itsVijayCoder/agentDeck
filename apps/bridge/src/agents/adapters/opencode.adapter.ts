import { homedir } from "node:os";
import { join } from "node:path";

import type { PtyManager } from "../../pty/pty-manager.js";
import type { TerminalSessionRegistry } from "../../pty/terminal-control.js";
import { PtyCliAgentAdapter } from "./pty-cli-adapter.js";

const capabilities = ["terminal", "repo-aware", "code-edit", "bash", "mcp", "acp", "json-events"] as const;

export class OpenCodeAdapter extends PtyCliAgentAdapter {
	constructor(ptyManager: PtyManager, terminalSessions?: TerminalSessionRegistry) {
		super(
			{
				authPaths: [join(homedir(), ".opencode", "config.json"), join(homedir(), ".config", "opencode", "config.json")],
				buildArgs: (task) => [
					"run",
					...(task.model ? ["--model", task.model] : []),
					task.prompt,
				],
				capabilities,
				command: "opencode",
				displayName: "OpenCode",
				harnessMode: "opencode-pty",
				id: "opencode",
				kind: "opencode",
				suggestedFix: "Install OpenCode and ensure the opencode command is on PATH.",
				versionArgs: ["--version"],
			},
			ptyManager,
			terminalSessions,
		);
	}
}
