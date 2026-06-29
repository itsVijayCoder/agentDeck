import { describe, expect, it } from "vitest";

import { JsonLineReader } from "./pi-json-lines.js";

describe("JsonLineReader", () => {
	it("handles split JSONL frames and text fallback", () => {
		const json: unknown[] = [];
		const text: string[] = [];
		const reader = new JsonLineReader({
			onJson: (value) => json.push(value),
			onText: (line) => text.push(line),
		});

		reader.push("{\"type\":\"agent_start\"");
		reader.push("}\nplain text\n");

		expect(json).toEqual([{ type: "agent_start" }]);
		expect(text).toEqual(["plain text\n"]);
	});

	it("flushes trailing buffered data", () => {
		const text: string[] = [];
		const reader = new JsonLineReader({
			onJson: () => undefined,
			onText: (line) => text.push(line),
		});

		reader.push("unterminated");
		reader.flush();

		expect(text).toEqual(["unterminated\n"]);
	});
});
