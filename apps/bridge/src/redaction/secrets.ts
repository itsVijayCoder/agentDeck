import type { JsonValue } from "../types.js";

type SecretPattern = {
	name: string;
	pattern: RegExp;
	replacement: string;
};

const secretPatterns: readonly SecretPattern[] = [
	{
		name: "env-assignment",
		pattern: /\b([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)[A-Z0-9_]*)\s*=\s*("[^"]+"|'[^']+'|[^\s]+)/gu,
		replacement: "$1=[REDACTED]",
	},
	{ name: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/gu, replacement: "sk-ant-[REDACTED]" },
	{ name: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/gu, replacement: "sk-[REDACTED]" },
	{ name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/gu, replacement: "ghp_[REDACTED]" },
	{ name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/gu, replacement: "AKIA[REDACTED]" },
	{
		name: "jwt",
		pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu,
		replacement: "[JWT_REDACTED]",
	},
	{
		name: "private-key",
		pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/gu,
		replacement: "[PRIVATE_KEY_REDACTED]",
	},
	{
		name: "authorization-header",
		pattern: /\b[Aa]uthorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gu,
		replacement: "Authorization: Bearer [REDACTED]",
	},
	{
		name: "database-url",
		pattern: /\b(postgres|postgresql|mongodb|redis|mysql):\/\/([^:\s/@]+):([^@\s]+)@/gu,
		replacement: "$1://$2:[REDACTED]@",
	},
];

const sensitiveKeyPattern = /(?:key|token|secret|password|credential|authorization|auth)/iu;

export type RedactionResult<TValue> = {
	redactionCount: number;
	value: TValue;
};

export function redact(input: string): string {
	return redactWithCount(input).value;
}

export function redactWithCount(input: string): RedactionResult<string> {
	let value = input;
	let redactionCount = 0;

	for (const { pattern, replacement } of secretPatterns) {
		redactionCount += value.match(pattern)?.length ?? 0;
		value = value.replace(pattern, replacement);
	}

	return { redactionCount, value };
}

export function redactStructured<TValue extends JsonValue>(input: TValue): RedactionResult<TValue> {
	const result = redactJsonValue(input);
	return {
		redactionCount: result.redactionCount,
		value: result.value as TValue,
	};
}

function redactJsonValue(input: JsonValue): RedactionResult<JsonValue> {
	if (typeof input === "string") {
		return redactWithCount(input);
	}

	if (Array.isArray(input)) {
		let redactionCount = 0;
		const value = input.map((item) => {
			const redacted = redactJsonValue(item);
			redactionCount += redacted.redactionCount;
			return redacted.value;
		});
		return { redactionCount, value };
	}

	if (input && typeof input === "object") {
		let redactionCount = 0;
		const value: Record<string, JsonValue> = {};
		for (const [key, nestedValue] of Object.entries(input)) {
			if (sensitiveKeyPattern.test(key)) {
				if (nestedValue !== null) {
					redactionCount += 1;
				}
				value[key] = "[REDACTED]";
				continue;
			}

			const redacted = redactJsonValue(nestedValue);
			redactionCount += redacted.redactionCount;
			value[key] = redacted.value;
		}
		return { redactionCount, value };
	}

	return { redactionCount: 0, value: input };
}
