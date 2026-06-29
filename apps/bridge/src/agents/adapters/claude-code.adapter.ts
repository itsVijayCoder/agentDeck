import { homedir } from "node:os";
import { join } from "node:path";

import type { PtyManager } from "../../pty/pty-manager.js";
import type { TerminalSessionRegistry } from "../../pty/terminal-control.js";
import { PtyCliAgentAdapter } from "./pty-cli-adapter.js";

const capabilities = ["terminal", "repo-aware", "code-edit", "bash", "mcp", "json-events", "model-switching"] as const;

export class ClaudeCodeAdapter extends PtyCliAgentAdapter {
	constructor(ptyManager: PtyManager, terminalSessions?: TerminalSessionRegistry) {
		super(
			{
				authPaths: [join(homedir(), ".claude", "config.json"), join(homedir(), ".claude.json")],
				buildArgs: (task) => [
					"--print",
					task.prompt,
					...(task.model ? ["--model", task.model] : []),
				],
				capabilities,
				command: "claude",
				displayName: "Claude Code",
				env: () => ({ CLAUDE_CODE_ENTRYPOINT: "agentdeck" }),
				harnessMode: "claude-code-pty",
				id: "claude-code",
				kind: "claude-code",
				suggestedFix: "Install Claude Code and ensure the claude command is on PATH.",
				versionArgs: ["--version"],
			},
			ptyManager,
			terminalSessions,
		);
	}
}
