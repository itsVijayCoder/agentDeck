export type JsonLineReaderHandlers = {
	onJson(value: unknown): void;
	onText(line: string): void;
};

export class JsonLineReader {
	private buffer = "";

	constructor(private readonly handlers: JsonLineReaderHandlers) {}

	push(chunk: string): void {
		this.buffer += chunk;

		for (;;) {
			const index = this.buffer.indexOf("\n");
			if (index === -1) {
				return;
			}

			const line = this.buffer.slice(0, index).replace(/\r$/u, "");
			this.buffer = this.buffer.slice(index + 1);
			this.handleLine(line);
		}
	}

	flush(): void {
		if (!this.buffer) {
			return;
		}

		const line = this.buffer;
		this.buffer = "";
		this.handleLine(line);
	}

	private handleLine(line: string): void {
		if (!line.trim()) {
			return;
		}

		try {
			this.handlers.onJson(JSON.parse(line) as unknown);
		} catch {
			this.handlers.onText(`${line}\n`);
		}
	}
}
