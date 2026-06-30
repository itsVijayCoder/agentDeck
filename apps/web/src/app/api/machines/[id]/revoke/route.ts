import { auditApiAction } from "@/lib/api/audit";
import { jsonResponse, notFound, withApiErrors } from "@/lib/api/errors";
import { requireWorkspaceRow } from "@/lib/api/access";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { getRepositories } from "@/lib/cloudflare-context";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("machine:manage");
		const { id } = await params;
		const repositories = await getRepositories();
		const existing = requireWorkspaceRow(await repositories.machines.findById(id), user, "Machine");
		const machine = await repositories.machines.revoke(existing.id);
		if (!machine) {
			notFound("Machine not found.");
		}
		await auditApiAction({
			action: "machine.revoked",
			details: { displayName: existing.display_name },
			repositories,
			request,
			resourceId: machine.id,
			resourceType: "machine",
			user,
		});

		return jsonResponse({ machine });
	});
}
