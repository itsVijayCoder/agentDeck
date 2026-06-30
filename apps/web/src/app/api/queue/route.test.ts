import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getRepositories: vi.fn(),
	getRunQueue: vi.fn(),
	requireSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
	requireSession: mocks.requireSession,
}));

vi.mock("@/lib/cloudflare-context", () => ({
	getRepositories: mocks.getRepositories,
	getRunQueue: mocks.getRunQueue,
}));

import { POST } from "./route";

const user = {
	role: "owner" as const,
	userId: "user_01",
	workspaceId: "ws_01",
};

const session = {
	created_at: "2026-06-30T00:00:00.000Z",
	created_by: user.userId,
	id: "sess_01",
	parent_session_id: null,
	privacy_mode: "metadata-only" as const,
	status: "draft" as const,
	title: "Fix auth refresh",
	updated_at: "2026-06-30T00:00:00.000Z",
	workspace_id: user.workspaceId,
};

function createRepositories() {
	return {
		auditLog: {
			create: vi.fn().mockResolvedValue({ id: "audit_01" }),
		},
		events: {
			append: vi.fn().mockResolvedValue({ id: "evt_01" }),
			nextSeq: vi.fn().mockResolvedValue(0),
		},
		queue: {
			enqueue: vi.fn().mockImplementation((input) =>
				Promise.resolve({
					agent_selector_json: input.agentSelector ? JSON.stringify(input.agentSelector) : null,
					cancelled_at: null,
					created_at: "2026-06-30T00:01:00.000Z",
					created_by: input.createdBy,
					id: input.id,
					machine_selector_json: null,
					max_cost_usd: input.maxCostUsd ?? null,
					max_runtime_minutes: input.maxRuntimeMinutes ?? null,
					priority: input.priority,
					run_after: null,
					schedule_window_json: null,
					session_id: input.sessionId ?? null,
					status: "queued",
					task: input.task,
					updated_at: "2026-06-30T00:01:00.000Z",
					workspace_id: input.workspaceId,
				}),
			),
		},
		sessions: {
			findById: vi.fn().mockResolvedValue(session),
			updateStatus: vi.fn().mockResolvedValue({ ...session, status: "queued" }),
		},
	};
}

describe("queue API routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireSession.mockResolvedValue(user);
		mocks.getRunQueue.mockResolvedValue({ send: vi.fn().mockResolvedValue(undefined) });
		mocks.getRepositories.mockResolvedValue(createRepositories());
	});

	it("creates a queue item linked to the browser-created session", async () => {
		const repositories = createRepositories();
		const runQueue = { send: vi.fn().mockResolvedValue(undefined) };
		mocks.getRepositories.mockResolvedValue(repositories);
		mocks.getRunQueue.mockResolvedValue(runQueue);

		const response = await POST(
			new NextRequest("http://localhost/api/queue", {
				body: JSON.stringify({
					agentSelector: { kind: "codex", strategy: "single" },
					priority: "high",
					sessionId: session.id,
					task: "Fix failing auth refresh test and prove it with unit tests.",
				}),
				method: "POST",
			}),
		);
		const body = (await response.json()) as { queueItem: { session_id: string } };

		expect(response.status).toBe(201);
		expect(body.queueItem.session_id).toBe(session.id);
		expect(repositories.queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ sessionId: session.id }));
		expect(repositories.sessions.updateStatus).toHaveBeenCalledWith(session.id, "queued");
		expect(runQueue.send).toHaveBeenCalledWith(expect.objectContaining({ queueItemId: expect.any(String), type: "queue.item" }));
		expect(repositories.events.append).toHaveBeenCalledWith({
			event: expect.objectContaining({
				sessionId: session.id,
				type: "session.started",
				workspaceId: user.workspaceId,
			}),
		});
		expect(repositories.events.append).toHaveBeenCalledWith({
			event: expect.objectContaining({
				sessionId: session.id,
				type: "queue.item_created",
				workspaceId: user.workspaceId,
			}),
		});
	});

	it("rejects a session outside the authenticated workspace", async () => {
		const repositories = createRepositories();
		repositories.sessions.findById.mockResolvedValue({ ...session, workspace_id: "other_ws" });
		mocks.getRepositories.mockResolvedValue(repositories);

		const response = await POST(
			new NextRequest("http://localhost/api/queue", {
				body: JSON.stringify({
					sessionId: session.id,
					task: "Fix failing auth refresh test and prove it with unit tests.",
				}),
				method: "POST",
			}),
		);
		const body = (await response.json()) as { code: string };

		expect(response.status).toBe(409);
		expect(body.code).toBe("CONFLICT");
		expect(repositories.queue.enqueue).not.toHaveBeenCalled();
	});
});
