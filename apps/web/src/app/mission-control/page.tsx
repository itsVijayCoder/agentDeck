import type { Metadata } from "next";
import { MissionControlScreen } from "@/components/agentdeck/mission-control-screen";

export const metadata: Metadata = {
	title: "Mission Control | AgentDeck",
};

export default function MissionControlPage() {
	return <MissionControlScreen />;
}
