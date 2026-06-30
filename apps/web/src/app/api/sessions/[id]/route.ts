import { requireWorkspaceRow } from "@/lib/api/access";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("session:read");
		const { id } = await params;
		const repositories = await getRepositories();
		const session = requireWorkspaceRow(await repositories.sessions.findById(id), user, "Session");
		const [runs, queueItem, approvals, artifacts, reports] = await Promise.all([
			repositories.runs.listBySession(session.id, 50),
			repositories.queue.findBySession(session.id),
			repositories.approvals.listByWorkspace(user.workspaceId, undefined, 200),
			repositories.artifacts.listBySession(session.id, 100),
			repositories.decisionReports.listByWorkspace(user.workspaceId, 100),
		]);

		return jsonResponse({
			approvals: approvals.filter((approval) => approval.session_id === session.id),
			artifacts,
			queueItem,
			reports: reports.filter((report) => report.session_id === session.id),
			runs,
			session,
		});
	});
}
