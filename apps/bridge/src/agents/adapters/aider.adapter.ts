import { homedir } from "node:os";
import { join } from "node:path";

import type { PtyManager } from "../../pty/pty-manager.js";
import type { TerminalSessionRegistry } from "../../pty/terminal-control.js";
import { PtyCliAgentAdapter } from "./pty-cli-adapter.js";

const capabilities = ["terminal", "repo-aware", "code-edit", "bash"] as const;

export class AiderAdapter extends PtyCliAgentAdapter {
	constructor(ptyManager: PtyManager, terminalSessions?: TerminalSessionRegistry) {
		super(
			{
				authPaths: [join(homedir(), ".aider.conf.yml"), join(homedir(), ".config", "aider", "config.yml")],
				buildArgs: (task) => [
					"--yes-always",
					...(task.model ? ["--model", task.model] : []),
					"--message",
					task.prompt,
				],
				capabilities,
				command: "aider",
				displayName: "Aider",
				harnessMode: "aider-pty",
				id: "aider",
				kind: "aider",
				suggestedFix: "Install Aider and ensure the aider command is on PATH.",
				versionArgs: ["--version"],
			},
			ptyManager,
			terminalSessions,
		);
	}
}
