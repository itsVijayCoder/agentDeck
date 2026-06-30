import type { NextRequest } from "next/server";
import { parseJsonColumn } from "@agentdeck/db";

import { auditApiAction } from "@/lib/api/audit";
import { requireWorkspaceRow } from "@/lib/api/access";
import { badRequest, jsonResponse, withApiErrors } from "@/lib/api/errors";
import { authorizeApiRequest } from "@/lib/api/permissions";
import { assertNonEmptyPatch, parseJsonRequest } from "@/lib/api/request";
import { updateScheduledJobRequestSchema } from "@/lib/api/schemas";
import { getRepositories } from "@/lib/cloudflare-context";
import { calculateNextRun, parseNaturalLanguageSchedule } from "@/lib/schedule-parser";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	return withApiErrors(async () => {
		const user = await authorizeApiRequest("schedule:manage");
		const body = await parseJsonRequest(request, updateScheduledJobRequestSchema);
		assertNonEmptyPatch(body);
		const { id } = await params;
		const repositories = await getRepositories();
		const existing = requireWorkspaceRow(await repositories.scheduledJobs.findById(id), user, "Schedule");
		const timing = resolveScheduleTiming(body, existing);
		const schedule = await repositories.scheduledJobs.upsert({
			agentSelector: body.agentSelector ?? parseJsonColumn(existing.agent_selector_json),
			cron: timing.cron,
			enabled: body.enabled ?? (existing.enabled === 1),
			id: existing.id,
			lastRunAt: existing.last_run_at,
			lastStatus: existing.last_status,
			machineSelector: body.machineSelector ?? parseJsonColumn(existing.machine_selector_json),
			name: body.name ?? existing.name,
			naturalLanguage: body.naturalLanguage ?? existing.natural_language,
			nextRunAt:
				body.nextRunAt === undefined
					? timing.changed
						? calculateNextRun(timing.cron, timing.timezone)
						: existing.next_run_at
					: body.nextRunAt,
			taskTemplate: body.taskTemplate ?? existing.task_template,
			timezone: timing.timezone,
			workspaceId: existing.workspace_id,
		});
		await auditApiAction({
			action: "schedule.updated",
			details: { cron: schedule.cron, enabled: schedule.enabled === 1 },
			repositories,
			request,
			resourceId: schedule.id,
			resourceType: "schedule",
			user,
		});

		return jsonResponse({ schedule });
	});
}

function resolveScheduleTiming(
	body: { cron?: string; naturalLanguage?: string; timezone?: string },
	existing: { cron: string; natural_language: string; timezone: string },
): { changed: boolean; cron: string; timezone: string } {
	const timezone = body.timezone ?? existing.timezone;
	if (body.cron) {
		return {
			changed: body.cron !== existing.cron || timezone !== existing.timezone,
			cron: body.cron,
			timezone,
		};
	}

	if (body.naturalLanguage) {
		const parsed = parseNaturalLanguageSchedule(body.naturalLanguage, timezone);
		if (!parsed) {
			badRequest("Provide a cron expression or a supported natural-language schedule.", "VALIDATION_ERROR");
		}
		return {
			changed: parsed.cron !== existing.cron || parsed.timezone !== existing.timezone,
			cron: parsed.cron,
			timezone: parsed.timezone,
		};
	}

	return {
		changed: timezone !== existing.timezone,
		cron: existing.cron,
		timezone,
	};
}
