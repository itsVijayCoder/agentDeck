import { homedir } from "node:os";
import { join } from "node:path";

import type { PtyManager } from "../../pty/pty-manager.js";
import type { TerminalSessionRegistry } from "../../pty/terminal-control.js";
import { PtyCliAgentAdapter } from "./pty-cli-adapter.js";

const capabilities = ["terminal", "repo-aware", "code-edit", "bash", "json-events", "model-switching"] as const;

export class CodexAdapter extends PtyCliAgentAdapter {
	constructor(ptyManager: PtyManager, terminalSessions?: TerminalSessionRegistry) {
		super(
			{
				authPaths: [join(homedir(), ".codex", "config.json"), join(homedir(), ".codex", "auth.json")],
				buildArgs: (task) => [
					"exec",
					...(task.model ? ["--model", task.model] : []),
					task.prompt,
				],
				capabilities,
				command: "codex",
				displayName: "Codex",
				harnessMode: "codex-pty",
				id: "codex",
				kind: "codex",
				suggestedFix: "Install Codex CLI and ensure the codex command is on PATH.",
				versionArgs: ["--version"],
			},
			ptyManager,
			terminalSessions,
		);
	}
}
