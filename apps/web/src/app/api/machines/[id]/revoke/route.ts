import { jsonResponse, notFound, withApiErrors } from "@/lib/api/errors";
import { requireWorkspaceRow } from "@/lib/api/access";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const { id } = await params;
		const repositories = await getRepositories();
		const existing = requireWorkspaceRow(await repositories.machines.findById(id), user, "Machine");
		const machine = await repositories.machines.revoke(existing.id);
		if (!machine) {
			notFound("Machine not found.");
		}

		return jsonResponse({ machine });
	});
}
