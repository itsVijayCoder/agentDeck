import { forbidden, notFound } from "@/lib/api/errors";
import type { SessionUser } from "@/lib/auth";

type WorkspaceScopedRow = {
	workspace_id: string;
};

export function requireWorkspaceRow<TRow extends WorkspaceScopedRow>(
	row: TRow | null,
	user: SessionUser,
	label = "Resource",
): TRow {
	if (!row) {
		notFound(`${label} not found.`);
	}

	if (row.workspace_id !== user.workspaceId) {
		forbidden();
	}

	return row;
}
