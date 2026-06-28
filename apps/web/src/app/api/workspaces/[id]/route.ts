import { forbidden, jsonResponse, notFound, withApiErrors } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const { id } = await params;

		if (id !== user.workspaceId) {
			forbidden();
		}

		const repositories = await getRepositories();
		const workspace = await repositories.workspaces.findById(id);
		if (!workspace) {
			notFound("Workspace not found.");
		}

		return jsonResponse({ workspace });
	});
}
