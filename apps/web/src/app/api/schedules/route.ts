import type { NextRequest } from "next/server";

import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { parseJsonRequest, parseQuery } from "@/lib/api/request";
import { limitQuerySchema, upsertScheduledJobRequestSchema } from "@/lib/api/schemas";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function GET(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const query = parseQuery(request, limitQuerySchema);
		const repositories = await getRepositories();
		const schedules = await repositories.scheduledJobs.listByWorkspace(user.workspaceId, query.limit);

		return jsonResponse({ schedules });
	});
}

export async function POST(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const body = await parseJsonRequest(request, upsertScheduledJobRequestSchema);
		const repositories = await getRepositories();
		const schedule = await repositories.scheduledJobs.upsert({
			agentSelector: body.agentSelector,
			cron: body.cron,
			enabled: body.enabled,
			id: crypto.randomUUID(),
			machineSelector: body.machineSelector,
			name: body.name,
			naturalLanguage: body.naturalLanguage,
			nextRunAt: body.nextRunAt,
			taskTemplate: body.taskTemplate,
			timezone: body.timezone,
			workspaceId: user.workspaceId,
		});

		return jsonResponse({ schedule }, { status: 201 });
	});
}
