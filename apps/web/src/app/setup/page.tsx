import type { Metadata } from "next";
import { SetupScreen } from "@/components/agentdeck/setup-screen";

export const metadata: Metadata = {
	title: "Setup | AgentDeck",
};

export default function SetupPage() {
	return <SetupScreen />;
}
