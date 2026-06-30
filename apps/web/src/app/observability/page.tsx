import type { Metadata } from "next";
import { ObservabilityScreen } from "@/components/agentdeck/route-screens";

export const metadata: Metadata = {
	title: "Observability | AgentDeck",
};

export default function ObservabilityPage() {
	return <ObservabilityScreen />;
}
