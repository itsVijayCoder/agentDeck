import type { Metadata } from "next";
import { PoliciesScreen } from "@/components/agentdeck/route-screens";

export const metadata: Metadata = {
	title: "Policies | AgentDeck",
};

export default function PoliciesPage() {
	return <PoliciesScreen />;
}
