import type { Metadata } from "next";
import { AgentInventoryScreen } from "@/components/agentdeck/route-screens";

export const metadata: Metadata = {
	title: "Agents | AgentDeck",
};

export const unstable_instant = {
	prefetch: "static",
};

export default function AgentsPage() {
	return <AgentInventoryScreen />;
}
