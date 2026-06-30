import type { NextRequest } from "next/server";

import { auditApiAction } from "@/lib/api/audit";
import { badRequest, jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { parseJsonRequest, parseQuery } from "@/lib/api/request";
import { limitQuerySchema, upsertScheduledJobRequestSchema } from "@/lib/api/schemas";
import { getRepositories } from "@/lib/cloudflare-context";
import { calculateNextRun, parseNaturalLanguageSchedule } from "@/lib/schedule-parser";

export async function GET(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("session:read");
		const query = parseQuery(request, limitQuerySchema);
		const repositories = await getRepositories();
		const schedules = await repositories.scheduledJobs.listByWorkspace(user.workspaceId, query.limit);

		return jsonResponse({ schedules });
	});
}

export async function POST(request: NextRequest) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("schedule:manage");
		const body = await parseJsonRequest(request, upsertScheduledJobRequestSchema);
		const scheduleTiming = resolveScheduleTiming(body);
		const repositories = await getRepositories();
		const schedule = await repositories.scheduledJobs.upsert({
			agentSelector: body.agentSelector,
			cron: scheduleTiming.cron,
			enabled: body.enabled,
			id: crypto.randomUUID(),
			machineSelector: body.machineSelector,
			name: body.name,
			naturalLanguage: body.naturalLanguage,
			nextRunAt: body.nextRunAt ?? calculateNextRun(scheduleTiming.cron, scheduleTiming.timezone),
			taskTemplate: body.taskTemplate,
			timezone: scheduleTiming.timezone,
			workspaceId: user.workspaceId,
		});
		await auditApiAction({
			action: "schedule.created",
			details: { cron: schedule.cron, enabled: schedule.enabled === 1, naturalLanguage: schedule.natural_language },
			repositories,
			request,
			resourceId: schedule.id,
			resourceType: "schedule",
			user,
		});

		return jsonResponse({ schedule }, { status: 201 });
	});
}

function resolveScheduleTiming(body: { cron?: string; naturalLanguage: string; timezone: string }): { cron: string; timezone: string } {
	if (body.cron) {
		return {
			cron: body.cron,
			timezone: body.timezone,
		};
	}

	const parsed = parseNaturalLanguageSchedule(body.naturalLanguage, body.timezone);
	if (!parsed) {
		badRequest("Provide a cron expression or a supported natural-language schedule.", "VALIDATION_ERROR");
	}
	return parsed;
}
