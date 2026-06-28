import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getRepositories: vi.fn(),
	requireSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
	requireSession: mocks.requireSession,
}));

vi.mock("@/lib/cloudflare-context", () => ({
	getRepositories: mocks.getRepositories,
}));

import { GET, POST } from "./route";

const user = {
	role: "owner" as const,
	userId: "user_01",
	workspaceId: "ws_01",
};

const workspace = {
	created_at: "2026-06-28T00:00:00.000Z",
	default_branch: "main",
	id: "ws_01",
	name: "OpenFusion",
	privacy_mode: "metadata-only",
	repository_url: null,
	updated_at: "2026-06-28T00:00:00.000Z",
};

function createRepositories() {
	return {
		events: {
			append: vi.fn().mockResolvedValue({ id: "evt_01" }),
			nextSeq: vi.fn().mockResolvedValue(0),
		},
		sessions: {
			create: vi.fn().mockResolvedValue({
				created_by: user.userId,
				id: "sess_01",
				privacy_mode: "metadata-only",
				status: "draft",
				title: "Wire control plane",
				workspace_id: user.workspaceId,
			}),
			listByWorkspace: vi.fn().mockResolvedValue([{ id: "sess_01" }]),
		},
		workspaces: {
			findById: vi.fn().mockResolvedValue(workspace),
		},
	};
}

describe("sessions API routes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.requireSession.mockResolvedValue(user);
		mocks.getRepositories.mockResolvedValue(createRepositories());
	});

	it("creates a session scoped to the authenticated workspace and appends an event", async () => {
		const repositories = createRepositories();
		mocks.getRepositories.mockResolvedValue(repositories);
		const response = await POST(
			new NextRequest("http://localhost/api/sessions", {
				body: JSON.stringify({ title: "Wire control plane" }),
				method: "POST",
			}),
		);

		expect(response.status).toBe(201);
		expect(repositories.sessions.create).toHaveBeenCalledWith(
			expect.objectContaining({
				createdBy: user.userId,
				privacyMode: workspace.privacy_mode,
				title: "Wire control plane",
				workspaceId: user.workspaceId,
			}),
		);
		expect(repositories.events.append).toHaveBeenCalledWith({
			event: expect.objectContaining({
				seq: 0,
				sessionId: "sess_01",
				type: "session.created",
				workspaceId: user.workspaceId,
			}),
		});
	});

	it("lists sessions with validated status and limit query parameters", async () => {
		const repositories = createRepositories();
		mocks.getRepositories.mockResolvedValue(repositories);

		const response = await GET(new NextRequest("http://localhost/api/sessions?status=running&limit=5"));

		expect(response.status).toBe(200);
		expect(repositories.sessions.listByWorkspace).toHaveBeenCalledWith(user.workspaceId, "running", 5);
	});

	it("returns a validation envelope for malformed create requests", async () => {
		const response = await POST(
			new NextRequest("http://localhost/api/sessions", {
				body: JSON.stringify({ title: " " }),
				method: "POST",
			}),
		);
		const body = (await response.json()) as { code: string };

		expect(response.status).toBe(400);
		expect(body.code).toBe("VALIDATION_ERROR");
	});
});
