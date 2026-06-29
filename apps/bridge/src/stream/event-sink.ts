import type { AgentDeckEvent, PrivacyMode } from "@agentdeck/core";
import type { BridgeMessage } from "@agentdeck/core";

import type { BridgeEventDraft, JsonValue } from "../types.js";
import { redactStructured } from "../redaction/secrets.js";
import { ReplayBuffer, type ReplayQueue } from "./replay-buffer.js";

export type EventSink = {
	emit(event: BridgeEventDraft): void;
	flush(): Promise<void>;
};

export type CloudEventSinkOptions = {
	flushIntervalMs?: number;
	maxBufferSize?: number;
	privacyMode: PrivacyMode;
	replayBuffer?: ReplayQueue<string>;
};

export type CloudEventSinkStats = {
	droppedLocalOnly: number;
	emitted: number;
	redactions: number;
};

export class CloudEventSink implements EventSink {
	private readonly buffer: BridgeEventDraft[] = [];
	private readonly flushIntervalMs: number;
	private readonly maxBufferSize: number;
	private readonly replayBuffer: ReplayQueue<string>;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private stats: CloudEventSinkStats = {
		droppedLocalOnly: 0,
		emitted: 0,
		redactions: 0,
	};

	constructor(
		private readonly send: (data: string) => boolean | void | Promise<boolean | void>,
		private readonly options: CloudEventSinkOptions,
	) {
		this.flushIntervalMs = options.flushIntervalMs ?? 100;
		this.maxBufferSize = options.maxBufferSize ?? 50;
		this.replayBuffer = options.replayBuffer ?? new ReplayBuffer<string>();
	}

	emit(event: BridgeEventDraft): void {
		if (this.shouldDropForPrivacy(event)) {
			this.stats = { ...this.stats, droppedLocalOnly: this.stats.droppedLocalOnly + 1 };
			return;
		}

		const redacted = this.redactEvent(event);
		this.buffer.push(redacted.event);
		this.stats = {
			...this.stats,
			emitted: this.stats.emitted + 1,
			redactions: this.stats.redactions + redacted.redactionCount,
		};

		if (this.buffer.length >= this.maxBufferSize) {
			this.flush().catch((error) => {
				console.error(error instanceof Error ? error.message : String(error));
			});
			return;
		}

		if (!this.flushTimer) {
			this.flushTimer = setTimeout(() => {
				this.flush().catch((error) => {
					console.error(error instanceof Error ? error.message : String(error));
				});
			}, this.flushIntervalMs);
		}
	}

	async flush(): Promise<void> {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}

		if (this.buffer.length === 0) {
			return;
		}

		const batch = this.buffer.splice(0);
		const message = JSON.stringify({
			events: batch as unknown as AgentDeckEvent[],
			type: "event.batch",
		} satisfies BridgeMessage);

		const sent = await this.send(message);
		if (sent === false) {
			this.replayBuffer.push(message);
		}
	}

	async sendBridgeMessage(message: BridgeMessage): Promise<boolean> {
		const encoded = JSON.stringify(message);
		const sent = await this.send(encoded);
		if (sent === false) {
			this.replayBuffer.push(encoded);
			return false;
		}
		return true;
	}

	flushReplayBuffer(): void {
		for (const message of this.replayBuffer.drain()) {
			const sent = this.send(message);
			if (sent === false) {
				this.replayBuffer.push(message);
				return;
			}
		}
	}

	getStats(): CloudEventSinkStats {
		return { ...this.stats };
	}

	private shouldDropForPrivacy(event: BridgeEventDraft): boolean {
		return this.options.privacyMode === "local-only" && isSensitiveEventType(event.type);
	}

	private redactEvent(event: BridgeEventDraft): { event: BridgeEventDraft; redactionCount: number } {
		const redactedPayload = redactStructured(event.payload);
		return {
			event: {
				...event,
				payload: redactedPayload.value as JsonValue,
				source: event.source ?? "bridge",
			},
			redactionCount: redactedPayload.redactionCount,
		};
	}
}

function isSensitiveEventType(type: string): boolean {
	return (
		type === "terminal.stdin" ||
		type === "terminal.stdout" ||
		type === "terminal.stderr" ||
		type.startsWith("message.") ||
		type === "tool.delta" ||
		type === "verifier.output"
	);
}
