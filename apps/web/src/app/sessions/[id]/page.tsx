import type { Metadata } from "next";
import { SessionDetailScreen } from "@/components/agentdeck/route-screens";

export const metadata: Metadata = {
	title: "Session | AgentDeck",
};

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;

	return <SessionDetailScreen sessionId={id} />;
}
