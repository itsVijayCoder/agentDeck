import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SessionDetailScreen } from "@/components/agentdeck/route-screens";
import { activeRun } from "@/lib/mock-agentdeck";

export const metadata: Metadata = {
	title: "Session | AgentDeck",
};

export function generateStaticParams() {
	return [{ id: activeRun.sessionId }];
}

export default async function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (id !== activeRun.sessionId) {
		notFound();
	}

	return <SessionDetailScreen sessionId={id} />;
}
