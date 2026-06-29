import type { UnifiedAiEvent } from "./types";

export type SseEvent = {
	data: string;
	event?: string;
};

export async function* readServerSentEvents(body: ReadableStream<Uint8Array>): AsyncIterable<SseEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const frames = buffer.split(/\r?\n\r?\n/);
			buffer = frames.pop() ?? "";

			for (const frame of frames) {
				const event = parseSseFrame(frame);
				if (event) {
					yield event;
				}
			}
		}

		buffer += decoder.decode();
		const event = parseSseFrame(buffer);
		if (event) {
			yield event;
		}
	} finally {
		reader.releaseLock();
	}
}

export async function* parseOpenAiChatStream(input: {
	body: ReadableStream<Uint8Array>;
	messageId: string;
	model: string;
	provider: string;
	requestId: string;
}): AsyncIterable<UnifiedAiEvent> {
	let inputTokens = 0;
	let outputTokens = 0;
	const toolCallNames = new Map<string, string>();
	const toolCallArgs = new Map<string, string>();
	let outputText = "";

	for await (const event of readServerSentEvents(input.body)) {
		if (event.data === "[DONE]") {
			continue;
		}

		const chunk = parseJsonRecord(event.data);
		const usage = parseUsage(chunk);
		if (usage) {
			inputTokens = usage.inputTokens;
			outputTokens = usage.outputTokens;
		}

		const choice = getObject(getArray(chunk.choices)?.[0]);
		const delta = getObject(choice?.delta);
		const content = stringField(delta, "content");
		if (content) {
			outputText += content;
			yield { delta: content, messageId: input.messageId, type: "ai.text.delta" };
		}

		const toolCalls = getArray(delta?.tool_calls);
		for (const toolCall of toolCalls ?? []) {
			const parsedToolCall = getObject(toolCall);
			if (!parsedToolCall) continue;

			const index = numberField(parsedToolCall, "index") ?? toolCallNames.size;
			const toolCallId = stringField(parsedToolCall, "id") ?? `tool-${index}`;
			const fn = getObject(parsedToolCall.function);
			const name = stringField(fn, "name");
			const argsDelta = stringField(fn, "arguments");

			if (name && !toolCallNames.has(toolCallId)) {
				toolCallNames.set(toolCallId, name);
				yield { name, toolCallId, type: "ai.tool_call.start" };
			}
			if (argsDelta) {
				toolCallArgs.set(toolCallId, `${toolCallArgs.get(toolCallId) ?? ""}${argsDelta}`);
				yield { argsDelta, toolCallId, type: "ai.tool_call.delta" };
			}
		}
	}

	for (const [toolCallId, argsText] of toolCallArgs) {
		yield { args: parseJsonOrText(argsText), toolCallId, type: "ai.tool_call.end" };
	}

	yield {
		inputTokens,
		model: input.model,
		outputTokens: outputTokens || estimateOutputTokens(outputText),
		provider: input.provider,
		requestId: input.requestId,
		type: "ai.usage",
	};
	yield { messageId: input.messageId, outputText, type: "ai.message.end" };
}

export function parseUsage(chunk: Record<string, unknown>): { inputTokens: number; outputTokens: number } | null {
	const usage = getObject(chunk.usage);
	if (!usage) {
		return null;
	}

	const promptTokens = numberField(usage, "prompt_tokens") ?? numberField(usage, "input_tokens");
	const completionTokens = numberField(usage, "completion_tokens") ?? numberField(usage, "output_tokens");
	if (promptTokens === undefined && completionTokens === undefined) {
		return null;
	}

	return {
		inputTokens: promptTokens ?? 0,
		outputTokens: completionTokens ?? 0,
	};
}

export function parseJsonRecord(value: string): Record<string, unknown> {
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {};
		}

		return parsed as Record<string, unknown>;
	} catch {
		return {};
	}
}

function parseSseFrame(frame: string): SseEvent | null {
	const lines = frame.split(/\r?\n/);
	const data: string[] = [];
	let event: string | undefined;

	for (const line of lines) {
		if (line.startsWith("event:")) {
			event = line.slice("event:".length).trim();
			continue;
		}
		if (line.startsWith("data:")) {
			data.push(line.slice("data:".length).trimStart());
		}
	}

	if (data.length === 0) {
		return null;
	}

	return {
		data: data.join("\n"),
		...(event ? { event } : {}),
	};
}

function estimateOutputTokens(value: string): number {
	return Math.ceil(value.length / 4);
}

function parseJsonOrText(value: string): unknown {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return value;
	}
}

function getObject(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}

	return value as Record<string, unknown>;
}

function getArray(value: unknown): unknown[] | undefined {
	return Array.isArray(value) ? value : undefined;
}

function numberField(value: Record<string, unknown>, key: string): number | undefined {
	const field = value[key];
	return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

function stringField(value: Record<string, unknown> | undefined, key: string): string | undefined {
	const field = value?.[key];
	return typeof field === "string" && field.length > 0 ? field : undefined;
}
