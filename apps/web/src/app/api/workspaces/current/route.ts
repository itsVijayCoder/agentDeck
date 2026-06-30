import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET() {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("session:read");
		const repositories = await getRepositories();
		const workspace = await repositories.workspaces.findById(user.workspaceId);
		if (!workspace) {
			return jsonResponse({ code: "NOT_FOUND", error: "Workspace not found." }, { status: 404 });
		}

		const [machines, pendingApprovals, metricSnapshots] = await Promise.all([
			repositories.machines.listByWorkspace(user.workspaceId, "online", 200),
			repositories.approvals.listByWorkspace(user.workspaceId, "pending", 200),
			repositories.metricSnapshots.listByWorkspace(user.workspaceId, undefined, undefined, 200),
		]);
		const costTodayUsd = metricSnapshots
			.filter((metric) => metric.metric_name === "cost_usd_by_workspace" && isToday(metric.period_start))
			.reduce((sum, metric) => sum + metric.metric_value, 0);

		return jsonResponse({
			costTodayUsd,
			machineCount: machines.length,
			pendingApprovals: pendingApprovals.length,
			user,
			workspace,
		});
	});
}

function isToday(value: string): boolean {
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) {
		return false;
	}
	const date = new Date(timestamp);
	const now = new Date();
	return (
		date.getUTCFullYear() === now.getUTCFullYear() &&
		date.getUTCMonth() === now.getUTCMonth() &&
		date.getUTCDate() === now.getUTCDate()
	);
}
