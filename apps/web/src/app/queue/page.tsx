import type { Metadata } from "next";
import { QueueScreen } from "@/components/agentdeck/route-screens";

export const metadata: Metadata = {
	title: "Queue | AgentDeck",
};

export const unstable_instant = {
	prefetch: "static",
};

export default function QueuePage() {
	return <QueueScreen />;
}
