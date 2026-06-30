export type AgentDeckDataMode = "live" | "mock";

export function getAgentDeckDataMode(): AgentDeckDataMode {
	const value = process.env.NEXT_PUBLIC_AGENTDECK_DATA_MODE ?? process.env.AGENTDECK_DATA_MODE;
	return value === "mock" ? "mock" : "live";
}

export function isLiveDataMode(): boolean {
	return getAgentDeckDataMode() === "live";
}
