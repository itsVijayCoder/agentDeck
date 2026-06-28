import { requireWorkspaceRow } from "@/lib/api/access";
import { notFound, withApiErrors } from "@/lib/api/errors";
import { requireSession } from "@/lib/auth";
import { getR2, getRepositories } from "@/lib/cloudflare-context";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const { id } = await params;
		const repositories = await getRepositories();
		const artifact = requireWorkspaceRow(await repositories.artifacts.findById(id), user, "Artifact");
		const object = await (await getR2()).get(artifact.object_key);
		if (!object) {
			notFound("Artifact object not found.");
		}

		if (!object.body) {
			return new Response(null, { status: 204 });
		}

		const headers = new Headers();
		headers.set("Content-Length", String(artifact.size_bytes));
		headers.set("Content-Type", artifact.mime_type);
		headers.set("ETag", object.etag);

		return new Response(object.body, { headers });
	});
}
