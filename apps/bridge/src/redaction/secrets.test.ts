import { describe, expect, it } from "vitest";

import { redact, redactStructured, redactWithCount } from "./secrets.js";

describe("secret redaction", () => {
	it("scrubs common token shapes", () => {
		const input = "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz Authorization: Bearer abc.def.ghi";

		expect(redact(input)).toContain("OPENAI_API_KEY=[REDACTED]");
		expect(redact(input)).toContain("Authorization: Bearer [REDACTED]");
	});

	it("counts replacements", () => {
		const result = redactWithCount("token=ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL");

		expect(result.redactionCount).toBeGreaterThan(0);
		expect(result.value).toContain("[REDACTED]");
	});

	it("redacts sensitive structured keys recursively", () => {
		const result = redactStructured({
			nested: {
				apiToken: "plain-value",
				message: "postgres://user:pass@localhost/db",
			},
		});

		expect(result.value).toEqual({
			nested: {
				apiToken: "[REDACTED]",
				message: "postgres://user:[REDACTED]@localhost/db",
			},
		});
		expect(result.redactionCount).toBe(2);
	});

	it("handles arrays and primitive values", () => {
		expect(redactStructured(["no secret", "ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL"]).value).toEqual([
			"no secret",
			"ghp_[REDACTED]",
		]);
		expect(redactStructured(null).value).toBeNull();
		expect(redactStructured(42).value).toBe(42);
		expect(redactStructured({ token: null }).redactionCount).toBe(0);
	});
});
