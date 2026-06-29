import { access, constants } from "node:fs/promises";
import { execa } from "execa";
import type { AgentCapability, AgentKind } from "@agentdeck/core";
import type { AgentAuthStatus, ProbeResult } from "@agentdeck/harness";

import type { AgentInstallSource, VersionProbeResult } from "../types.js";

export type CommandProbeSpec = {
	authPaths: readonly string[];
	capabilities: readonly AgentCapability[];
	command: string;
	installSource?: AgentInstallSource;
	kind: AgentKind;
	suggestedFix?: string;
	versionArgs: readonly string[];
};

export type CommandProbeOptions = {
	authChecker?: (paths: readonly string[]) => Promise<AgentAuthStatus>;
	versionProbe?: (command: string, args: readonly string[]) => Promise<VersionProbeResult>;
};

export async function probeCommand(spec: CommandProbeSpec, options: CommandProbeOptions = {}): Promise<ProbeResult> {
	const versionProbe = options.versionProbe ?? runVersionProbe;
	const authChecker = options.authChecker ?? checkAuthStatus;
	const probe = await versionProbe(spec.command, spec.versionArgs);

	if (!probe.found) {
		return {
			agentKind: spec.kind,
			authStatus: "unknown",
			capabilities: [],
			found: false,
			suggestedFix: spec.suggestedFix ?? `Install ${spec.kind} or add ${spec.command} to PATH.`,
			warnings: [`${spec.command} was not found on PATH.`],
		};
	}

	const authStatus = await authChecker(spec.authPaths);
	const version = normalizeVersionOutput(probe.stdout ?? probe.stderr);

	return {
		agentKind: spec.kind,
		authStatus,
		capabilities: [...spec.capabilities],
		command: spec.command,
		found: true,
		installSource: spec.installSource ?? "path",
		...(version ? { version } : {}),
		warnings: authStatus === "missing" ? [`${spec.kind} appears to be installed but is not authenticated.`] : [],
	};
}

async function runVersionProbe(command: string, args: readonly string[]): Promise<VersionProbeResult> {
	try {
		const result = await execa(command, [...args], {
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
			// Only presence is checked; credential files are never read.
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
