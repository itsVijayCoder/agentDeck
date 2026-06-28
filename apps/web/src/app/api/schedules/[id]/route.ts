import type { NextRequest } from "next/server";
import { parseJsonColumn } from "@agentdeck/db";

import { requireWorkspaceRow } from "@/lib/api/access";
import { jsonResponse, withApiErrors } from "@/lib/api/errors";
import { assertNonEmptyPatch, parseJsonRequest } from "@/lib/api/request";
import { updateScheduledJobRequestSchema } from "@/lib/api/schemas";
import { requireSession } from "@/lib/auth";
import { getRepositories } from "@/lib/cloudflare-context";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await requireSession();
		const body = await parseJsonRequest(request, updateScheduledJobRequestSchema);
		assertNonEmptyPatch(body);
		const { id } = await params;
		const repositories = await getRepositories();
		const existing = requireWorkspaceRow(await repositories.scheduledJobs.findById(id), user, "Schedule");
		const schedule = await repositories.scheduledJobs.upsert({
			agentSelector: body.agentSelector ?? parseJsonColumn(existing.agent_selector_json),
			cron: body.cron ?? existing.cron,
			enabled: body.enabled ?? (existing.enabled === 1),
			id: existing.id,
			lastRunAt: existing.last_run_at,
			lastStatus: existing.last_status,
			machineSelector: body.machineSelector ?? parseJsonColumn(existing.machine_selector_json),
			name: body.name ?? existing.name,
			naturalLanguage: body.naturalLanguage ?? existing.natural_language,
			nextRunAt: body.nextRunAt === undefined ? existing.next_run_at : body.nextRunAt,
			taskTemplate: body.taskTemplate ?? existing.task_template,
			timezone: body.timezone ?? existing.timezone,
			workspaceId: existing.workspace_id,
		});

		return jsonResponse({ schedule });
	});
}
