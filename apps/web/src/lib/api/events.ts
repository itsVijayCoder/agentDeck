import type { EventSource, EventVisibility, AgentDeckEvent, AgentDeckEventType, PrivacyMode } from "@agentdeck/core";
import type { JsonValue, AgentDeckRepositories } from "@agentdeck/db";

type AppendApiEventInput = {
	payload: JsonValue;
	runId?: string | null;
	sessionId: string;
	source?: EventSource;
	type: AgentDeckEventType;
	visibility: EventVisibility;
	workspaceId: string;
};

export async function appendApiEvent(repositories: AgentDeckRepositories, input: AppendApiEventInput): Promise<void> {
	const seq = await repositories.events.nextSeq(input.sessionId);

	await repositories.events.append({
		event: {
			createdAt: new Date().toISOString(),
			id: crypto.randomUUID(),
			payload: input.payload,
			runId: input.runId ?? undefined,
			seq,
			sessionId: input.sessionId,
			source: input.source ?? "worker",
			type: input.type,
			visibility: input.visibility,
			workspaceId: input.workspaceId,
		} as AgentDeckEvent,
	});
}

export function visibilityForPrivacyMode(privacyMode: PrivacyMode): EventVisibility {
	return privacyMode === "full-sync" ? "full" : privacyMode === "local-only" ? "local-only" : "metadata";
}
