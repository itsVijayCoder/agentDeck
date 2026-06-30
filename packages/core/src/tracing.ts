export type TraceAttribute = boolean | number | string;

export type TraceContext = {
	agentId?: string;
	machineId?: string;
	queueItemId?: string;
	runId: string;
	scheduleId?: string;
	sessionId: string;
	traceId: string;
	workflowId?: string;
	workspaceId?: string;
};

export type SpanStatus = "ok" | "error";

export type SpanEvent = {
	attributes?: Record<string, unknown>;
	name: string;
	timestamp: number;
};

export type Span = {
	attributes: Record<string, TraceAttribute>;
	endTime?: number;
	events: SpanEvent[];
	name: string;
	parentSpanId?: string;
	spanId: string;
	startTime: number;
	status: SpanStatus;
	traceId: string;
};

type IdFactory = {
	spanId(): string;
	traceId(): string;
};

type Clock = () => number;

export class Tracer {
	private activeSpanStack: Span[] = [];
	private readonly clock: Clock;
	private readonly ids: IdFactory;
	private spans: Span[] = [];

	constructor(options: { clock?: Clock; ids?: IdFactory } = {}) {
		this.clock = options.clock ?? (() => Date.now());
		this.ids = options.ids ?? defaultIdFactory;
	}

	createTraceContext(input: Omit<TraceContext, "traceId"> & { traceId?: string }): TraceContext {
		return {
			...input,
			traceId: input.traceId ?? this.ids.traceId(),
		};
	}

	startSpan(name: string, ctx: TraceContext, attributes: Record<string, TraceAttribute> = {}): Span {
		const parent = this.activeSpanStack.at(-1);
		const span: Span = {
			attributes: {
				...attributes,
				runId: ctx.runId,
				sessionId: ctx.sessionId,
				...(ctx.workspaceId ? { workspaceId: ctx.workspaceId } : {}),
				...(ctx.machineId ? { machineId: ctx.machineId } : {}),
				...(ctx.agentId ? { agentId: ctx.agentId } : {}),
				...(ctx.workflowId ? { workflowId: ctx.workflowId } : {}),
				...(ctx.queueItemId ? { queueItemId: ctx.queueItemId } : {}),
				...(ctx.scheduleId ? { scheduleId: ctx.scheduleId } : {}),
			},
			events: [],
			name,
			...(parent ? { parentSpanId: parent.spanId } : {}),
			spanId: this.ids.spanId(),
			startTime: this.clock(),
			status: "ok",
			traceId: ctx.traceId,
		};

		this.spans.push(span);
		this.activeSpanStack.push(span);
		return span;
	}

	endSpan(span: Span, status: SpanStatus = "ok"): void {
		span.endTime = this.clock();
		span.status = status;
		this.activeSpanStack = this.activeSpanStack.filter((active) => active.spanId !== span.spanId);
	}

	addEvent(span: Span, name: string, attributes?: Record<string, unknown>): void {
		span.events.push({
			...(attributes ? { attributes } : {}),
			name,
			timestamp: this.clock(),
		});
	}

	getSpans(): Span[] {
		return this.spans.map(copySpan);
	}

	flush(): Span[] {
		const flushed = this.getSpans();
		this.spans = [];
		this.activeSpanStack = [];
		return flushed;
	}

	async withSpan<T>(
		name: string,
		ctx: TraceContext,
		operation: (span: Span) => Promise<T>,
		attributes: Record<string, TraceAttribute> = {},
	): Promise<T> {
		const span = this.startSpan(name, ctx, attributes);
		try {
			const result = await operation(span);
			this.endSpan(span, "ok");
			return result;
		} catch (error) {
			this.addEvent(span, "exception", { error: error instanceof Error ? error.message : String(error) });
			this.endSpan(span, "error");
			throw error;
		}
	}
}

export function createTraceId(): string {
	return randomHex(16);
}

export function createSpanId(): string {
	return randomHex(8);
}

const defaultIdFactory: IdFactory = {
	spanId: createSpanId,
	traceId: createTraceId,
};

function copySpan(span: Span): Span {
	return {
		attributes: { ...span.attributes },
		...(span.endTime === undefined ? {} : { endTime: span.endTime }),
		events: span.events.map((event) => ({
			...(event.attributes ? { attributes: { ...event.attributes } } : {}),
			name: event.name,
			timestamp: event.timestamp,
		})),
		name: span.name,
		...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
		spanId: span.spanId,
		startTime: span.startTime,
		status: span.status,
		traceId: span.traceId,
	};
}

function randomHex(byteLength: number): string {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
