import { requireWorkspaceRow } from "@/lib/api/access";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const { id } = await params;
		const repositories = await getRepositories();
		const machine = requireWorkspaceRow(await repositories.machines.findById(id), user, "Machine");

		return jsonResponse(
			{
				machineId: machine.id,
				status: "accepted",
			},
			{ status: 202 },
		);
	});
}
