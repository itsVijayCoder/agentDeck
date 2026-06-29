import { describe, expect, it } from "vitest";

import { parseJsonRecord, parseOpenAiChatStream, parseUsage, readServerSentEvents } from "./sse";

describe("SSE parsing", () => {
	it("reads multi-line server-sent events", async () => {
		const events = [];
		for await (const event of readServerSentEvents(stream("event: update\ndata: one\ndata: two\n\n"))) {
			events.push(event);
		}

		expect(events).toEqual([{ data: "one\ntwo", event: "update" }]);
	});

	it("parses OpenAI-compatible chat streams into unified events", async () => {
		const frames = [
			{ choices: [{ delta: { content: "Hel" } }] },
			{ choices: [{ delta: { content: "lo" } }] },
			{
				choices: [
					{
						delta: {
							tool_calls: [
								{ function: { name: "run_test" }, id: "tool_1", index: 0 },
								{ function: { arguments: "{\"cmd\":" }, id: "tool_1", index: 0 },
							],
						},
					},
				],
			},
			{ choices: [{ delta: { tool_calls: [{ function: { arguments: "\"pnpm test\"}" }, id: "tool_1", index: 0 }] } }] },
			{ usage: { completion_tokens: 4, prompt_tokens: 12 } },
		]
			.map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
			.join("");

		const events = [];
		for await (const event of parseOpenAiChatStream({
			body: stream(`${frames}data: [DONE]\n\n`),
			messageId: "msg_1",
			model: "openai/gpt",
			provider: "openai",
			requestId: "req_1",
		})) {
			events.push(event);
		}

		expect(events).toContainEqual({ delta: "Hel", messageId: "msg_1", type: "ai.text.delta" });
		expect(events).toContainEqual({ delta: "lo", messageId: "msg_1", type: "ai.text.delta" });
		expect(events).toContainEqual({ name: "run_test", toolCallId: "tool_1", type: "ai.tool_call.start" });
		expect(events).toContainEqual({ args: { cmd: "pnpm test" }, toolCallId: "tool_1", type: "ai.tool_call.end" });
		expect(events).toContainEqual({
			inputTokens: 12,
			model: "openai/gpt",
			outputTokens: 4,
			provider: "openai",
			requestId: "req_1",
			type: "ai.usage",
		});
		expect(events.at(-1)).toEqual({ messageId: "msg_1", outputText: "Hello", type: "ai.message.end" });
	});

	it("handles malformed JSON and usage aliases defensively", () => {
		expect(parseJsonRecord("not-json")).toEqual({});
		expect(parseUsage({ usage: { input_tokens: 2, output_tokens: 3 } })).toEqual({ inputTokens: 2, outputTokens: 3 });
		expect(parseUsage({ usage: {} })).toBeNull();
		expect(parseUsage({})).toBeNull();
	});
});

export function stream(text: string): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(text));
			controller.close();
		},
	});
}
