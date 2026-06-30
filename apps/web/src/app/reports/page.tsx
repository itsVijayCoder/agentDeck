import type { Metadata } from "next";
import { ReportsScreen } from "@/components/agentdeck/route-screens";

export const metadata: Metadata = {
	title: "Reports | AgentDeck",
};

export const unstable_instant = {
	prefetch: "static",
};

export default function ReportsPage() {
	return <ReportsScreen />;
}
