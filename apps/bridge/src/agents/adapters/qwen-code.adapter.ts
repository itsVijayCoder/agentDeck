import { homedir } from "node:os";
import { join } from "node:path";

import type { PtyManager } from "../../pty/pty-manager.js";
import type { TerminalSessionRegistry } from "../../pty/terminal-control.js";
import { PtyCliAgentAdapter } from "./pty-cli-adapter.js";

const capabilities = ["terminal", "repo-aware", "code-edit", "bash"] as const;

export class QwenCodeAdapter extends PtyCliAgentAdapter {
	constructor(ptyManager: PtyManager, terminalSessions?: TerminalSessionRegistry) {
		super(
			{
				authPaths: [join(homedir(), ".qwen", "config.json"), join(homedir(), ".qwen", "auth.json")],
				buildArgs: (task) => [
					...(task.model ? ["--model", task.model] : []),
					task.prompt,
				],
				capabilities,
				command: "qwen",
				displayName: "Qwen Code",
				harnessMode: "qwen-code-pty",
				id: "qwen-code",
				kind: "qwen-code",
				suggestedFix: "Install Qwen Code and ensure the qwen command is on PATH.",
				versionArgs: ["--version"],
			},
			ptyManager,
			terminalSessions,
		);
	}
}
