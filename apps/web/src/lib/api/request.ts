import type { NextRequest } from "next/server";
import type { z } from "zod";

import { badRequest } from "@/lib/api/errors";

export async function parseJsonRequest<TSchema extends z.ZodType>(request: NextRequest | Request, schema: TSchema): Promise<z.infer<TSchema>> {
	const body = await readJson(request);
	return schema.parse(body);
}

export async function parseOptionalJsonRequest<TSchema extends z.ZodType>(
	request: NextRequest | Request,
	schema: TSchema,
): Promise<z.infer<TSchema>> {
	const text = await request.text();
	if (text.trim().length === 0) {
		return schema.parse({});
	}

	try {
		return schema.parse(JSON.parse(text));
	} catch (error) {
		if (error instanceof SyntaxError) {
			badRequest("Expected a valid JSON request body.");
		}
		throw error;
	}
}

export function parseQuery<TSchema extends z.ZodType>(request: NextRequest, schema: TSchema): z.infer<TSchema> {
	return schema.parse(Object.fromEntries(request.nextUrl.searchParams));
}

export function assertNonEmptyPatch(value: Record<string, unknown>): void {
	if (Object.keys(value).length === 0) {
		badRequest("At least one field must be provided.", "VALIDATION_ERROR");
	}
}

async function readJson(request: NextRequest | Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		badRequest("Expected a valid JSON request body.");
	}
}
