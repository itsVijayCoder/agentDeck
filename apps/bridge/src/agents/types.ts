import type { AgentCapability, AgentKind } from "@agentdeck/core";
import type { ProbeResult } from "@agentdeck/harness";

import type { AgentAuthStatus } from "../types.js";

export type { AgentInstallSource, ProbeResult } from "@agentdeck/harness";

export type AgentCommandSpec = {
	authPaths: string[];
	capabilities: AgentCapability[];
	command: string;
	kind: AgentKind;
	versionArgs: string[];
};

export type AgentAdapter = {
	readonly displayName: string;
	readonly kind: AgentKind;
	probe(): Promise<ProbeResult>;
};

export type VersionProbeResult = {
	found: boolean;
	stderr?: string;
	stdout?: string;
};

export type DetectorOptions = {
	authChecker?: (paths: string[]) => Promise<AgentAuthStatus>;
	specs?: readonly AgentCommandSpec[];
	versionProbe?: (command: string, args: string[]) => Promise<VersionProbeResult>;
};
