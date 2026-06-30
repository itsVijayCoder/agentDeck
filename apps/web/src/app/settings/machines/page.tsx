import type { Metadata } from "next";
import { MachineSettingsScreen } from "@/components/agentdeck/route-screens";

export const metadata: Metadata = {
	title: "Machines | AgentDeck",
};

export default function MachinesPage() {
	return <MachineSettingsScreen />;
}
