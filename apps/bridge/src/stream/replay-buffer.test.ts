import { describe, expect, it } from "vitest";

import { ReplayBuffer } from "./replay-buffer.js";

describe("ReplayBuffer", () => {
	it("evicts the oldest entries at capacity and drains in order", () => {
		const buffer = new ReplayBuffer<number>(2);

		buffer.push(1);
		buffer.push(2);
		buffer.push(3);

		expect(buffer.peek()).toEqual([2, 3]);
		expect(buffer.drain()).toEqual([2, 3]);
		expect(buffer.size).toBe(0);
	});
});
