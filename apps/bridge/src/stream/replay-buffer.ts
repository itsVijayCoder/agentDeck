export type ReplayQueue<TValue> = {
	drain(): TValue[];
	peek(): readonly TValue[];
	push(item: TValue): void;
	readonly size: number;
};

export class ReplayBuffer<TValue> implements ReplayQueue<TValue> {
	private readonly items: TValue[] = [];

	constructor(private readonly maxItems = 1_000) {}

	push(item: TValue): void {
		this.items.push(item);
		if (this.items.length > this.maxItems) {
			this.items.splice(0, this.items.length - this.maxItems);
		}
	}

	drain(): TValue[] {
		return this.items.splice(0);
	}

	peek(): readonly TValue[] {
		return this.items;
	}

	get size(): number {
		return this.items.length;
	}
}
