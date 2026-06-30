export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEntry = {
	level: LogLevel;
	message: string;
	runId?: string;
	sessionId?: string;
	timestamp: string;
	traceId?: string;
	[key: string]: unknown;
};

export type LogSink = (entry: LogEntry) => void;

const logLevelPriority: Record<LogLevel, number> = {
	debug: 10,
	error: 40,
	info: 20,
	warn: 30,
};

type Clock = () => Date;

export class Logger {
	private readonly clock: Clock;
	private readonly minLevel: LogLevel;
	private readonly sink: LogSink;

	constructor(options: { clock?: Clock; minLevel?: LogLevel; sink?: LogSink } = {}) {
		this.clock = options.clock ?? (() => new Date());
		this.minLevel = options.minLevel ?? "info";
		this.sink = options.sink ?? ((entry) => console.log(entry));
	}

	debug(message: string, context: Record<string, unknown> = {}): void {
		this.log("debug", message, context);
	}

	info(message: string, context: Record<string, unknown> = {}): void {
		this.log("info", message, context);
	}

	warn(message: string, context: Record<string, unknown> = {}): void {
		this.log("warn", message, context);
	}

	error(message: string, context: Record<string, unknown> = {}): void {
		this.log("error", message, context);
	}

	child(context: Record<string, unknown>): Logger {
		return new Logger({
			clock: this.clock,
			minLevel: this.minLevel,
			sink: (entry) => this.sink({ ...context, ...entry }),
		});
	}

	private log(level: LogLevel, message: string, context: Record<string, unknown>): void {
		if (logLevelPriority[level] < logLevelPriority[this.minLevel]) {
			return;
		}

		this.sink({
			timestamp: this.clock().toISOString(),
			level,
			message,
			...normalizeContext(context),
		});
	}
}

export function createJsonLogger(minLevel: LogLevel = "info"): Logger {
	return new Logger({
		minLevel,
		sink: (entry) => {
			console.log(JSON.stringify(entry));
		},
	});
}

function normalizeContext(context: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(context).map(([key, value]) => [key, value instanceof Error ? { message: value.message, name: value.name } : value]),
	);
}
