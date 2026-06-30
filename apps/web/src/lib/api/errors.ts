import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorCode = "BAD_REQUEST" | "CONFLICT" | "FORBIDDEN" | "INTERNAL_ERROR" | "NOT_FOUND" | "UNAUTHORIZED" | "VALIDATION_ERROR";

export class ApiError extends Error {
	constructor(
		readonly status: number,
		readonly code: ApiErrorCode,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
}

export function badRequest(message: string, code: ApiErrorCode = "BAD_REQUEST"): never {
	throw new ApiError(400, code, message);
}

export function conflict(message: string): never {
	throw new ApiError(409, "CONFLICT", message);
}

export function forbidden(message = "Forbidden"): never {
	throw new ApiError(403, "FORBIDDEN", message);
}

export function notFound(message = "Not found"): never {
	throw new ApiError(404, "NOT_FOUND", message);
}

export function unauthorized(message = "Unauthorized"): never {
	throw new ApiError(401, "UNAUTHORIZED", message);
}

export function jsonResponse<TBody>(body: TBody, init?: ResponseInit): NextResponse<TBody> {
	return NextResponse.json(body, init);
}

export function handleApiError(error: unknown): NextResponse {
	if (error instanceof ApiError) {
		return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
	}

	if (error instanceof ZodError) {
		return NextResponse.json(
			{
				code: "VALIDATION_ERROR",
				error: "Request validation failed.",
				issues: error.issues.map((issue) => ({ message: issue.message, path: issue.path })),
			},
			{ status: 400 },
		);
	}

	if (error instanceof Error && process.env.NODE_ENV !== "production") {
		const safeMessages = [
			"AGENTDECK_SESSION_SECRET is required",
			"AgentDeck Cloudflare bindings are not configured",
			"D1_ERROR",
			"no such table",
		];
		if (safeMessages.some((message) => error.message.includes(message))) {
			return NextResponse.json({ code: "INTERNAL_ERROR", error: error.message }, { status: 500 });
		}
	}

	return NextResponse.json({ code: "INTERNAL_ERROR", error: "Internal server error." }, { status: 500 });
}

export async function withApiErrors<TResponse extends Response>(operation: () => Promise<TResponse>): Promise<TResponse | NextResponse> {
	try {
		return await operation();
	} catch (error) {
		return handleApiError(error);
	}
}
