import type { Metadata } from "next";
import { MissionControlScreen } from "@/components/agentdeck/mission-control-screen";

export const metadata: Metadata = {
	title: "Mission Control | AgentDeck",
};

export const unstable_instant = {
	prefetch: "static",
};

export default function MissionControlPage() {
	return <MissionControlScreen />;
}
