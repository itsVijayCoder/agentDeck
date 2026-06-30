import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportDetailScreen } from "@/components/agentdeck/route-screens";
import { decisionReport } from "@/lib/mock-agentdeck";

export const metadata: Metadata = {
	title: "Report Detail | AgentDeck",
};

export function generateStaticParams() {
	return [{ id: decisionReport.id }];
}

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (id !== decisionReport.id) {
		notFound();
	}

	return <ReportDetailScreen reportId={id} />;
}
