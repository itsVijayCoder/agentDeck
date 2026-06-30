import type { Metadata } from "next";
import { SchedulesScreen } from "@/components/agentdeck/route-screens";

export const metadata: Metadata = {
	title: "Schedules | AgentDeck",
};

export default function SchedulesPage() {
	return <SchedulesScreen />;
}
