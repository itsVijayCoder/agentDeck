import type { Metadata } from "next";
import { TeamScreen } from "@/components/agentdeck/route-screens";

export const metadata: Metadata = {
	title: "Team | AgentDeck",
};

export default function TeamPage() {
	return <TeamScreen />;
}
