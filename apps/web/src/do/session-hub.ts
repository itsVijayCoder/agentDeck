import { DurableObject } from "cloudflare:workers";
import { transitionApprovalStatus } from "@agentdeck/core";
import type { EventEnvelope, EventVisibility, AgentDeckEvent, PrivacyMode } from "@agentdeck/core";
import {
	SESSION_HUB_RECENT_EVENT_LIMIT,
	type SessionHubClientRole,
	type SessionHubErrorCode,
	type SessionHubServerMessage,
	isSessionHubClientRole,
} from "@agentdeck/bridge-protocol";
import {
	createAgentDeckRepositories,
	agentDeckEventSchema,
	type AgentDeckRepositories,
} from "@agentdeck/db";

import {
	SESSION_HUB_HEADERS,
	bridgeMessageToEventDrafts,
	browserControlForBridge,
	browserControlToEventDraft,
	parseBrowserControlMessage,
	shouldStorePayloadInR2,
	visibilityForEvent,
	type SessionHubEventDraft,
} from "./session-hub-protocol";

type SessionHubEnv = CloudflareEnv & {
	AGENTDECK_ARTIFACTS: R2Bucket;
	AGENTDECK_DB: D1Database;
};

type AuthorizedClient = {
	machineId?: string;
	role: SessionHubClientRole;
	sessionId: string;
	userId?: string;
	workspaceId: string;
};

type ClientAttachment = AuthorizedClient & {
	clientId: string;
	connectedAt: string;
};

type SessionMetaRow = {
	created_at: string;
	id: number;
	last_seq: number;
	privacy_mode: PrivacyMode;
	session_id: string;
	updated_at: string;
	workspace_id: string;
};

type RecentEventRow = {
	envelope_json: string;
	seq: number;
};

class SessionHubHttpError extends Error {
	constructor(
		readonly status: number,
		readonly code: SessionHubErrorCode,
		message: string,
	) {
		super(message);
		this.name = "SessionHubHttpError";
	}
}

export class SessionHub extends DurableObject<SessionHubEnv> {
	constructor(ctx: DurableObjectState, env: SessionHubEnv) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			this.migrate();
		});
	}

	async fetch(request: Request): Promise<Response> {
		try {
			if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
				return Response.json({ code: "BAD_MESSAGE", error: "Expected a WebSocket upgrade request." }, { status: 426 });
			}

			const client = readAuthorizedClient(request);
			await this.ensureInitialized(client.sessionId, client.workspaceId);

			const { 0: browserSocket, 1: hubSocket } = new WebSocketPair();
			const connectedAt = new Date().toISOString();
			const attachment: ClientAttachment = {
				...client,
				clientId: crypto.randomUUID(),
				connectedAt,
			};
			hubSocket.serializeAttachment(attachment);
			this.ctx.acceptWebSocket(hubSocket, [client.role, attachment.clientId]);

			const lastSeq = parseLastSeq(request);
			const replayed = this.replayRecentEvents(hubSocket, lastSeq);
			this.send(hubSocket, {
				clientId: attachment.clientId,
				connectedAt,
				lastSeq: this.getLastSeq(),
				replayed,
				role: client.role,
				sessionId: client.sessionId,
				type: "connection.established",
			});

			return new Response(null, { status: 101, webSocket: browserSocket });
		} catch (error) {
			if (error instanceof SessionHubHttpError) {
				return Response.json({ code: error.code, error: error.message }, { status: error.status });
			}

			console.error(JSON.stringify({ error: errorToString(error), message: "session hub websocket setup failed" }));
			return Response.json({ code: "PERSISTENCE_ERROR", error: "Session hub setup failed." }, { status: 500 });
		}
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const client = readClientAttachment(ws);
		if (!client) {
			this.sendError(ws, "UNAUTHORIZED", "WebSocket client metadata is missing.");
			ws.close(1008, "Missing AgentDeck client metadata.");
			return;
		}

		try {
			const parsed = parseWebSocketJson(message);
			if (parsed === null) {
				this.sendError(ws, "BAD_MESSAGE", "Expected a JSON WebSocket message.");
				return;
			}

			if (client.role === "bridge") {
				await this.handleBridgeMessage(ws, parsed);
				return;
			}

			await this.handleBrowserMessage(ws, client, parsed);
		} catch (error) {
			if (error instanceof SessionHubHttpError) {
				this.sendError(ws, error.code, error.message);
				return;
			}

			console.error(JSON.stringify({ error: errorToString(error), message: "session hub message handling failed" }));
			this.sendError(ws, "PERSISTENCE_ERROR", "Session hub message handling failed.");
		}
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		const client = readClientAttachment(ws);
		if (client?.role === "bridge") {
			await this.persistAndBroadcast({
				payload: { machineId: client.machineId ?? "unknown", reason: "bridge disconnected" },
				source: "durable-object",
				type: "machine.offline",
				visibility: "metadata",
			});
		}
	}

	async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
		console.error(JSON.stringify({ error: errorToString(error), message: "session hub websocket error" }));
		await this.webSocketClose(ws);
	}

	private migrate(): void {
		this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
				id INTEGER PRIMARY KEY,
				applied_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
		`);

		const currentVersion = this.ctx.storage.sql
			.exec<{ version: number }>("SELECT COALESCE(MAX(id), 0) AS version FROM _sql_schema_migrations")
			.one().version;

		if (currentVersion < 1) {
			this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS session_meta (
					id INTEGER PRIMARY KEY CHECK (id = 1),
					session_id TEXT NOT NULL,
					workspace_id TEXT NOT NULL,
					privacy_mode TEXT NOT NULL,
					last_seq INTEGER NOT NULL DEFAULT -1,
					created_at TEXT NOT NULL,
					updated_at TEXT NOT NULL
				);

				CREATE TABLE IF NOT EXISTS recent_events (
					seq INTEGER PRIMARY KEY,
					envelope_json TEXT NOT NULL,
					created_at TEXT NOT NULL
				);

				CREATE INDEX IF NOT EXISTS idx_recent_events_seq ON recent_events(seq);
				INSERT INTO _sql_schema_migrations (id) VALUES (1);
			`);
		}
	}

	private async ensureInitialized(sessionId: string, workspaceId: string): Promise<void> {
		const existing = this.getSessionMeta();
		if (existing) {
			if (existing.session_id !== sessionId || existing.workspace_id !== workspaceId) {
				throw new SessionHubHttpError(403, "FORBIDDEN", "Session hub identity does not match the requested session.");
			}
			return;
		}

		const repositories = this.getRepositories();
		const session = await repositories.sessions.findById(sessionId);
		if (!session) {
			throw new SessionHubHttpError(404, "NOT_FOUND", "Session not found.");
		}
		if (session.workspace_id !== workspaceId) {
			throw new SessionHubHttpError(403, "FORBIDDEN", "Session does not belong to the authenticated workspace.");
		}

		const nextSeq = await repositories.events.nextSeq(sessionId);
		const now = new Date().toISOString();
		this.ctx.storage.sql.exec(
			`INSERT OR IGNORE INTO session_meta (
				id, session_id, workspace_id, privacy_mode, last_seq, created_at, updated_at
			)
			VALUES (1, ?, ?, ?, ?, ?, ?)`,
			session.id,
			session.workspace_id,
			session.privacy_mode,
			Math.max(-1, nextSeq - 1),
			now,
			now,
		);
	}

	private async handleBridgeMessage(ws: WebSocket, message: unknown): Promise<void> {
		const drafts = bridgeMessageToEventDrafts(message);
		if (!drafts) {
			this.sendError(ws, "BAD_MESSAGE", "Bridge message does not match the AgentDeck protocol.");
			return;
		}

		for (const draft of drafts) {
			await this.persistAndBroadcast(draft);
		}
	}

	private async handleBrowserMessage(ws: WebSocket, client: ClientAttachment, message: unknown): Promise<void> {
		const control = parseBrowserControlMessage(message);
		if (!control) {
			this.sendError(ws, "BAD_MESSAGE", "Browser control message does not match the AgentDeck protocol.");
			return;
		}

		const forwarded = this.forwardToBridge(browserControlForBridge(control, client.userId ?? "unknown"));
		if (forwarded === 0) {
			this.sendError(ws, "BRIDGE_UNAVAILABLE", "No bridge is connected for this session.");
		}

		let approvalRunId: string | undefined;
		if (control.type === "approval.decide") {
			const approval = await this.getRepositories().approvals.findById(control.approvalId);
			if (!approval) {
				this.sendError(ws, "NOT_FOUND", "Approval not found.");
				return;
			}
			if (approval.workspace_id !== client.workspaceId || approval.session_id !== client.sessionId) {
				this.sendError(ws, "FORBIDDEN", "Approval does not belong to this session.");
				return;
			}
			const transition = transitionApprovalStatus(approval.status, control.status);
			if (!transition.ok) {
				this.sendError(ws, "CONFLICT", transition.reason);
				return;
			}

			await this.getRepositories().approvals.decide({
				decidedBy: client.userId,
				decision: control.notes ? { notes: control.notes } : null,
				id: approval.id,
				status: control.status,
			});
			approvalRunId = approval.run_id;
		}

		const draft = browserControlToEventDraft(control, client.userId ?? "unknown", approvalRunId);
		if (draft) {
			await this.persistAndBroadcast(draft);
		}
	}

	private async persistAndBroadcast(draft: SessionHubEventDraft): Promise<void> {
		const meta = this.requireSessionMeta();
		const visibility = draft.visibility ?? visibilityForEvent(draft.type, meta.privacy_mode);
		const validationEnvelope = createEnvelope({ draft, meta, seq: 0, visibility });
		const validation = agentDeckEventSchema.safeParse(validationEnvelope);
		if (!validation.success) {
			throw new SessionHubHttpError(400, "VALIDATION_ERROR", "Event envelope failed AgentDeck validation.");
		}

		const seq = this.reserveNextSeq();
		const envelope = createEnvelope({ draft, meta, seq, visibility });
		this.cacheRecentEvent(envelope);
		this.broadcast(envelope);

		this.ctx.waitUntil(
			this.persistEnvelope(envelope, meta.privacy_mode).catch((error) => {
				console.error(
					JSON.stringify({
						error: errorToString(error),
						eventId: envelope.id,
						message: "failed to persist session hub event",
						sessionId: envelope.sessionId,
						seq: envelope.seq,
					}),
				);
			}),
		);
	}

	private async persistEnvelope(envelope: EventEnvelope, privacyMode: PrivacyMode): Promise<void> {
		const payloadJson = JSON.stringify(envelope.payload);
		const payloadBytes = new TextEncoder().encode(payloadJson).byteLength;
		const objectKey = shouldStorePayloadInR2({
			payloadBytes,
			privacyMode,
			type: envelope.type as AgentDeckEvent["type"],
		})
			? buildPayloadObjectKey(envelope)
			: null;
		const hash = await sha256Hex(payloadJson);

		if (objectKey) {
			await this.env.AGENTDECK_ARTIFACTS.put(objectKey, payloadJson, {
				customMetadata: {
					eventId: envelope.id,
					sessionId: envelope.sessionId,
					type: envelope.type,
				},
				httpMetadata: {
					contentType: "application/json",
				},
			});
		}

		await this.getRepositories().events.append({
			event: { ...envelope, hash } as AgentDeckEvent,
			objectKey,
		});
	}

	private reserveNextSeq(): number {
		const meta = this.requireSessionMeta();
		const seq = meta.last_seq + 1;
		const now = new Date().toISOString();
		this.ctx.storage.sql.exec("UPDATE session_meta SET last_seq = ?, updated_at = ? WHERE id = 1", seq, now);
		return seq;
	}

	private cacheRecentEvent(envelope: EventEnvelope): void {
		this.ctx.storage.sql.exec(
			"INSERT OR REPLACE INTO recent_events (seq, envelope_json, created_at) VALUES (?, ?, ?)",
			envelope.seq,
			JSON.stringify(envelope),
			envelope.createdAt,
		);
		this.ctx.storage.sql.exec(
			`DELETE FROM recent_events
			 WHERE seq NOT IN (
				SELECT seq FROM recent_events ORDER BY seq DESC LIMIT ?
			 )`,
			SESSION_HUB_RECENT_EVENT_LIMIT,
		);
	}

	private replayRecentEvents(ws: WebSocket, lastSeq: number): number {
		const rows = this.ctx.storage.sql
			.exec<RecentEventRow>(
				"SELECT seq, envelope_json FROM recent_events WHERE seq > ? ORDER BY seq ASC LIMIT ?",
				lastSeq,
				SESSION_HUB_RECENT_EVENT_LIMIT,
			)
			.toArray();

		for (const row of rows) {
			this.sendRawJson(ws, row.envelope_json);
		}
		return rows.length;
	}

	private forwardToBridge(message: unknown): number {
		const bridgeSockets = this.ctx.getWebSockets("bridge");
		for (const socket of bridgeSockets) {
			this.send(socket, message);
		}
		return bridgeSockets.length;
	}

	private broadcast(envelope: EventEnvelope): void {
		for (const socket of this.ctx.getWebSockets()) {
			this.send(socket, envelope);
		}
	}

	private send(ws: WebSocket, message: SessionHubServerMessage | unknown): void {
		this.sendRawJson(ws, JSON.stringify(message));
	}

	private sendRawJson(ws: WebSocket, json: string): void {
		try {
			ws.send(json);
		} catch (error) {
			console.error(JSON.stringify({ error: errorToString(error), message: "failed to send websocket message" }));
		}
	}

	private sendError(ws: WebSocket, code: SessionHubErrorCode, message: string): void {
		this.send(ws, { code, message, type: "error" });
	}

	private getLastSeq(): number {
		return this.getSessionMeta()?.last_seq ?? -1;
	}

	private getSessionMeta(): SessionMetaRow | null {
		return this.ctx.storage.sql
			.exec<SessionMetaRow>(
				"SELECT id, session_id, workspace_id, privacy_mode, last_seq, created_at, updated_at FROM session_meta WHERE id = 1",
			)
			.toArray()[0] ?? null;
	}

	private requireSessionMeta(): SessionMetaRow {
		const meta = this.getSessionMeta();
		if (!meta) {
			throw new SessionHubHttpError(404, "NOT_FOUND", "Session hub has not been initialized.");
		}
		return meta;
	}

	private getRepositories(): AgentDeckRepositories {
		return createAgentDeckRepositories(this.env.AGENTDECK_DB);
	}
}

function readAuthorizedClient(request: Request): AuthorizedClient {
	const role = request.headers.get(SESSION_HUB_HEADERS.clientRole);
	const sessionId = request.headers.get(SESSION_HUB_HEADERS.sessionId);
	const workspaceId = request.headers.get(SESSION_HUB_HEADERS.workspaceId);

	if (!isSessionHubClientRole(role)) {
		throw new SessionHubHttpError(400, "INVALID_ROLE", "Invalid SessionHub client role.");
	}
	if (!sessionId || !workspaceId) {
		throw new SessionHubHttpError(401, "UNAUTHORIZED", "Missing SessionHub authorization metadata.");
	}

	const userId = request.headers.get(SESSION_HUB_HEADERS.userId) ?? undefined;
	const machineId = request.headers.get(SESSION_HUB_HEADERS.machineId) ?? undefined;
	if (role === "bridge" && !machineId) {
		throw new SessionHubHttpError(401, "UNAUTHORIZED", "Bridge connections require a machine id.");
	}
	if ((role === "browser" || role === "observer") && !userId) {
		throw new SessionHubHttpError(401, "UNAUTHORIZED", "Browser connections require a user id.");
	}

	return { machineId, role, sessionId, userId, workspaceId };
}

function readClientAttachment(ws: WebSocket): ClientAttachment | null {
	const attachment = ws.deserializeAttachment();
	if (!isClientAttachment(attachment)) {
		return null;
	}
	return attachment;
}

function isClientAttachment(value: unknown): value is ClientAttachment {
	return (
		isRecord(value) &&
		typeof value.clientId === "string" &&
		typeof value.connectedAt === "string" &&
		typeof value.sessionId === "string" &&
		typeof value.workspaceId === "string" &&
		isSessionHubClientRole(typeof value.role === "string" ? value.role : null) &&
		(value.userId === undefined || typeof value.userId === "string") &&
		(value.machineId === undefined || typeof value.machineId === "string")
	);
}

function parseWebSocketJson(message: string | ArrayBuffer): unknown | null {
	try {
		const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
		return JSON.parse(raw) as unknown;
	} catch {
		return null;
	}
}

function parseLastSeq(request: Request): number {
	const url = new URL(request.url);
	const raw = url.searchParams.get("lastSeq") ?? url.searchParams.get("afterSeq");
	if (raw === null) {
		return -1;
	}

	const parsed = Number(raw);
	return Number.isInteger(parsed) && parsed >= -1 ? parsed : -1;
}

function createEnvelope(input: {
	draft: SessionHubEventDraft;
	meta: SessionMetaRow;
	seq: number;
	visibility: EventVisibility;
}): EventEnvelope {
	return {
		createdAt: new Date().toISOString(),
		id: crypto.randomUUID(),
		payload: input.draft.payload,
		runId: input.draft.runId,
		seq: input.seq,
		sessionId: input.meta.session_id,
		source: input.draft.source,
		type: input.draft.type,
		visibility: input.visibility,
		workspaceId: input.meta.workspace_id,
	};
}

function buildPayloadObjectKey(envelope: EventEnvelope): string {
	return `workspaces/${envelope.workspaceId}/sessions/${envelope.sessionId}/events/${envelope.seq}-${envelope.id}.json`;
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorToString(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
