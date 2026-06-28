import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it } from "vitest";

import type { OpenFusionEvent } from "@openfusion/core";
import { createOpenFusionRepositories } from "./repositories";

let miniflare: Miniflare | null = null;

async function createMigratedDatabase(): Promise<D1Database> {
	miniflare = new Miniflare({
		d1Databases: ["OPENFUSION_DB"],
		d1Persist: false,
		modules: true,
		script: "export default { fetch() { return new Response('ok'); } };",
	});

	const db = await miniflare.getD1Database("OPENFUSION_DB");
	const migration = await readFile(new URL("../migrations/0001_openfusion_core.sql", import.meta.url), "utf8");
	for (const statement of splitSqlStatements(migration)) {
		await db.prepare(statement).run();
	}
	return db;
}

function splitSqlStatements(sql: string): string[] {
	return sql
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("--"))
		.join("\n")
		.split(";")
		.map((statement) => statement.trim())
		.filter((statement) => statement.length > 0);
}

describe("OpenFusion repositories with Miniflare D1", () => {
	afterEach(async () => {
		await miniflare?.dispose();
		miniflare = null;
	});

	it("applies the canonical migration and persists core control-plane rows", async () => {
		const db = await createMigratedDatabase();
		const repositories = createOpenFusionRepositories(db);
		const now = "2026-06-28T00:00:00.000Z";

		const workspace = await repositories.workspaces.create({
			createdAt: now,
			id: "ws_miniflare",
			name: "Miniflare Workspace",
			privacyMode: "metadata-only",
			updatedAt: now,
		});
		const session = await repositories.sessions.create({
			createdAt: now,
			createdBy: "user_01",
			id: "sess_miniflare",
			privacyMode: workspace.privacy_mode,
			title: "Exercise D1",
			updatedAt: now,
			workspaceId: workspace.id,
		});
		const event: OpenFusionEvent = {
			createdAt: now,
			id: "evt_miniflare",
			payload: { privacyMode: session.privacy_mode, title: session.title },
			seq: await repositories.events.nextSeq(session.id),
			sessionId: session.id,
			source: "worker",
			type: "session.created",
			visibility: "metadata",
			workspaceId: workspace.id,
		};

		await repositories.events.append({ event });

		await expect(repositories.sessions.listByWorkspace(workspace.id)).resolves.toHaveLength(1);
		await expect(repositories.events.listBySession(session.id, -1, 10)).resolves.toMatchObject([
			{ id: event.id, seq: 0, type: "session.created" },
		]);
	});
});
