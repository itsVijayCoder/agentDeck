import type { NextRequest } from "next/server";

import { auditApiAction } from "@/lib/api/audit";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { parseOptionalJsonRequest } from "@/lib/api/request";
import { createEvalRunRequestSchema } from "@/lib/api/schemas";
import { getRepositories } from "@/lib/cloudflare-context";

export async function POST(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("queue:manage");
		const body = await parseOptionalJsonRequest(request, createEvalRunRequestSchema);
		const repositories = await getRepositories();
		const now = new Date().toISOString();
		const evalRun = await repositories.evalRuns.create({
			agentKind: body.agentKind,
			createdAt: now,
			datasetId: body.datasetId,
			id: `eval_${crypto.randomUUID()}`,
			...(body.model === undefined ? {} : { model: body.model }),
			startedAt: now,
			status: "queued",
			workspaceId: user.workspaceId,
		});
		await auditApiAction({
			action: "eval.started",
			details: { agentKind: evalRun.agent_kind, datasetId: evalRun.dataset_id, model: evalRun.model },
			repositories,
			request,
			resourceId: evalRun.id,
			resourceType: "eval",
			user,
		});

		return jsonResponse({ evalRun }, { status: 202 });
	});
}
