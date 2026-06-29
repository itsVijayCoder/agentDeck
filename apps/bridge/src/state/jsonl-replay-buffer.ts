import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { z } from "zod";

import type { ReplayQueue } from "../stream/replay-buffer.js";

const replayRecordSchema = z
	.object({
		createdAt: z.string().trim().min(1),
		id: z.string().trim().min(1),
		item: z.string(),
	})
	.strict();

type ReplayRecord = z.infer<typeof replayRecordSchema>;

export class JsonlReplayBuffer implements ReplayQueue<string> {
	constructor(private readonly path: string) {}

	push(item: string): void {
		mkdirSync(dirname(this.path), { recursive: true });
		const record: ReplayRecord = {
			createdAt: new Date().toISOString(),
			id: randomUUID(),
			item,
		};
		appendFileSync(this.path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
	}

	drain(): string[] {
		const items = this.peek();
		this.clear();
		return [...items];
	}

	peek(): readonly string[] {
		return this.readRecords().map((record) => record.item);
	}

	get size(): number {
		return this.readRecords().length;
	}

	private clear(): void {
		mkdirSync(dirname(this.path), { recursive: true });
		writeFileSync(this.path, "", { mode: 0o600 });
	}

	private readRecords(): ReplayRecord[] {
		let raw: string;
		try {
			raw = readFileSync(this.path, "utf8");
		} catch (error) {
			if (isNodeError(error) && error.code === "ENOENT") {
				return [];
			}
			throw error;
		}

		return raw
			.split(/\r?\n/u)
			.filter(Boolean)
			.flatMap((line) => {
				try {
					const parsed = replayRecordSchema.safeParse(JSON.parse(line) as unknown);
					return parsed.success ? [parsed.data] : [];
				} catch {
					return [];
				}
			});
	}
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
