import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { JsonlReplayBuffer } from "./jsonl-replay-buffer.js";

describe("JsonlReplayBuffer", () => {
	it("persists, peeks, and drains replay items", async () => {
		const dir = await mkdtemp(join(tmpdir(), "agentdeck-state-"));
		const buffer = new JsonlReplayBuffer(join(dir, "state.jsonl"));

		buffer.push("first");
		buffer.push("second");

		expect(buffer.size).toBe(2);
		expect(buffer.peek()).toEqual(["first", "second"]);
		expect(buffer.drain()).toEqual(["first", "second"]);
		expect(buffer.size).toBe(0);
	});

	it("ignores invalid JSONL records without losing valid records", async () => {
		const dir = await mkdtemp(join(tmpdir(), "agentdeck-state-"));
		const path = join(dir, "state.jsonl");
		await writeFile(
			path,
			`not-json\n${JSON.stringify({ createdAt: "now", id: "bad", item: 42 })}\n${JSON.stringify({
				createdAt: "now",
				id: "1",
				item: "valid",
			})}\n`,
			"utf8",
		);

		expect(new JsonlReplayBuffer(path).peek()).toEqual(["valid"]);
	});

	it("treats missing state files as an empty queue", async () => {
		const dir = await mkdtemp(join(tmpdir(), "agentdeck-state-"));
		const buffer = new JsonlReplayBuffer(join(dir, "missing", "state.jsonl"));

		expect(buffer.size).toBe(0);
		expect(buffer.peek()).toEqual([]);
		expect(buffer.drain()).toEqual([]);
		expect(buffer.size).toBe(0);
	});
});
