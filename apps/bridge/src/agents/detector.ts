import { access, constants } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";

import type { AgentAuthStatus, DetectedAgentForPairing } from "../types.js";
import type { AgentCommandSpec, DetectorOptions, ProbeResult, VersionProbeResult } from "./types.js";

const baseCapabilities = ["terminal", "repo-aware", "code-edit", "bash"] as const;

export const AGENT_COMMANDS = [
	{
		authPaths: [join(homedir(), ".claude", "config.json"), join(homedir(), ".claude.json")],
		capabilities: [...baseCapabilities, "mcp", "json-events", "model-switching"],
		command: "claude",
		kind: "claude-code",
		versionArgs: ["--version"],
	},
	{
		authPaths: [join(homedir(), ".codex", "config.json"), join(homedir(), ".codex", "auth.json")],
		capabilities: [...baseCapabilities, "json-events", "model-switching"],
		command: "codex",
		kind: "codex",
		versionArgs: ["--version"],
	},
	{
		authPaths: [join(homedir(), ".opencode", "config.json"), join(homedir(), ".config", "opencode", "config.json")],
		capabilities: [...baseCapabilities, "mcp", "acp", "json-events"],
		command: "opencode",
		kind: "opencode",
		versionArgs: ["--version"],
	},
	{
		authPaths: [join(homedir(), ".qwen", "config.json"), join(homedir(), ".qwen", "auth.json")],
		capabilities: [...baseCapabilities],
		command: "qwen",
		kind: "qwen-code",
		versionArgs: ["--version"],
	},
	{
		authPaths: [join(homedir(), ".pi", "agent", "auth.json"), join(homedir(), ".pi", "config.json")],
		capabilities: [...baseCapabilities, "json-events", "rpc", "sdk", "model-switching", "session-branching"],
		command: "pi",
		kind: "pi",
		versionArgs: ["--version"],
	},
	{
		authPaths: [join(homedir(), ".aider.conf.yml"), join(homedir(), ".config", "aider", "config.yml")],
		capabilities: [...baseCapabilities],
		command: "aider",
		kind: "aider",
		versionArgs: ["--version"],
	},
	{
		authPaths: [join(homedir(), ".config", "acp", "config.json")],
		capabilities: [...baseCapabilities, "acp", "json-events"],
		command: "acp",
		kind: "acp",
		versionArgs: ["--version"],
	},
] as const satisfies readonly AgentCommandSpec[];

export async function detectAgents(options: DetectorOptions = {}): Promise<ProbeResult[]> {
	const specs = options.specs ?? AGENT_COMMANDS;
	const versionProbe = options.versionProbe ?? runVersionProbe;
	const authChecker = options.authChecker ?? checkAuthStatus;

	return Promise.all(specs.map((agent) => probeAgent(agent, { authChecker, versionProbe })));
}

export function pairingAgentsFromProbeResults(results: readonly ProbeResult[]): DetectedAgentForPairing[] {
	return results
		.filter((result): result is ProbeResult & { command: string } => result.found && typeof result.command === "string")
		.map((result) => ({
			authStatus: result.authStatus,
			capabilities: result.capabilities,
			command: result.command,
			kind: result.agentKind,
			version: result.version ?? null,
		}));
}

async function probeAgent(
	agent: AgentCommandSpec,
	options: Required<Pick<DetectorOptions, "authChecker" | "versionProbe">>,
): Promise<ProbeResult> {
	const probe = await options.versionProbe(agent.command, agent.versionArgs);
	if (!probe.found) {
		return {
			agentKind: agent.kind,
			authStatus: "unknown",
			capabilities: [],
			found: false,
			suggestedFix: `Install ${agent.kind} or add ${agent.command} to PATH.`,
			warnings: [`${agent.command} was not found on PATH.`],
		};
	}

	const authStatus = await options.authChecker(agent.authPaths);
	const version = normalizeVersionOutput(probe.stdout ?? probe.stderr);
	const warnings = authStatus === "missing" ? [`${agent.kind} appears to be installed but is not authenticated.`] : [];

	return {
		agentKind: agent.kind,
		authStatus,
		capabilities: [...agent.capabilities],
		command: agent.command,
		found: true,
		installSource: "path",
		...(version ? { version } : {}),
		warnings,
	};
}

async function runVersionProbe(command: string, args: string[]): Promise<VersionProbeResult> {
	try {
		const result = await execa(command, args, {
			reject: false,
			timeout: 2_000,
		});

		return {
			found: true,
			stderr: result.stderr,
			stdout: result.stdout,
		};
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			return { found: false };
		}

		return {
			found: false,
			stderr: error instanceof Error ? error.message : String(error),
		};
	}
}

async function checkAuthStatus(paths: readonly string[]): Promise<AgentAuthStatus> {
	for (const path of paths) {
		try {
			await access(path, constants.F_OK);
			return "configured";
		} catch {
			// Only existence is checked; credential contents are never read.
		}
	}

	return paths.length > 0 ? "missing" : "unknown";
}

function normalizeVersionOutput(value: string | undefined): string | undefined {
	const normalized = value?.trim().split(/\r?\n/u)[0]?.trim();
	return normalized ? normalized.slice(0, 120) : undefined;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
