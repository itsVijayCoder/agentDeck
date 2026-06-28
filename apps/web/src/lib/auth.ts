import { cookies } from "next/headers";

import { unauthorized } from "@/lib/api/errors";

export const SESSION_COOKIE = "of_session";
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const PAIRING_CODE_MAX_AGE_MS = 1000 * 60 * 10;

export type SessionUser = {
	role: "member" | "observer" | "owner";
	userId: string;
	workspaceId: string;
};

type SignedSessionPayload = SessionUser & {
	expiresAt: number;
	nonce: string;
	purpose: "browser-session";
};

type PairingPayload = {
	expiresAt: number;
	nonce: string;
	purpose: "bridge-pairing";
	requestedBy: string;
	workspaceId: string;
};

export async function getSession(): Promise<SessionUser | null> {
	const store = await cookies();
	const cookie = store.get(SESSION_COOKIE);
	if (!cookie) {
		return null;
	}

	return openSessionCookie(cookie.value);
}

export async function requireSession(): Promise<SessionUser> {
	const session = await getSession();
	if (!session) {
		unauthorized();
	}
	return session;
}

export async function createSession(user: SessionUser): Promise<void> {
	const store = await cookies();
	const value = await sealSessionCookie(user);

	store.set(SESSION_COOKIE, value, {
		httpOnly: true,
		maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
		path: "/",
		sameSite: "strict",
		secure: process.env.NODE_ENV === "production",
	});
}

export async function clearSession(): Promise<void> {
	const store = await cookies();
	store.delete(SESSION_COOKIE);
}

export async function sealSessionCookie(user: SessionUser, now = Date.now()): Promise<string> {
	return signPayload({
		...user,
		expiresAt: now + SESSION_COOKIE_MAX_AGE_SECONDS * 1000,
		nonce: randomHex(16),
		purpose: "browser-session",
	});
}

export async function openSessionCookie(value: string, now = Date.now()): Promise<SessionUser | null> {
	const payload = await verifySignedPayload<SignedSessionPayload>(value);
	if (!payload || payload.purpose !== "browser-session" || payload.expiresAt <= now) {
		return null;
	}

	return {
		role: payload.role,
		userId: payload.userId,
		workspaceId: payload.workspaceId,
	};
}

export async function generatePairingCode(user: SessionUser, now = Date.now()): Promise<string> {
	return signPayload({
		expiresAt: now + PAIRING_CODE_MAX_AGE_MS,
		nonce: randomHex(12),
		purpose: "bridge-pairing",
		requestedBy: user.userId,
		workspaceId: user.workspaceId,
	});
}

export async function verifyPairingCode(value: string, now = Date.now()): Promise<PairingPayload | null> {
	const payload = await verifySignedPayload<PairingPayload>(value);
	if (!payload || payload.purpose !== "bridge-pairing" || payload.expiresAt <= now) {
		return null;
	}
	return payload;
}

async function signPayload(payload: Record<string, unknown>): Promise<string> {
	const encodedPayload = encodeBase64Url(JSON.stringify(payload));
	const signature = await sign(encodedPayload);
	return `${encodedPayload}.${signature}`;
}

async function verifySignedPayload<TPayload>(value: string): Promise<TPayload | null> {
	const [encodedPayload, signature, extra] = value.split(".");
	if (!encodedPayload || !signature || extra !== undefined) {
		return null;
	}

	const expectedSignature = await sign(encodedPayload);
	if (!fixedTimeEqual(signature, expectedSignature)) {
		return null;
	}

	try {
		return JSON.parse(decodeBase64Url(encodedPayload)) as TPayload;
	} catch {
		return null;
	}
}

async function sign(value: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(getSessionSecret()),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
	return bytesToBase64Url(new Uint8Array(signature));
}

function getSessionSecret(): string {
	const secret = process.env.OPENFUSION_SESSION_SECRET;
	if (!secret) {
		throw new Error("OPENFUSION_SESSION_SECRET is required for OpenFusion API sessions.");
	}
	return secret;
}

function randomHex(byteLength: number): string {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encodeBase64Url(value: string): string {
	return bytesToBase64Url(new TextEncoder().encode(value));
}

function decodeBase64Url(value: string): string {
	return new TextDecoder().decode(base64UrlToBytes(value));
}

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string): Uint8Array {
	const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

function fixedTimeEqual(left: string, right: string): boolean {
	const leftBytes = new TextEncoder().encode(left);
	const rightBytes = new TextEncoder().encode(right);
	let diff = leftBytes.length ^ rightBytes.length;
	const length = Math.max(leftBytes.length, rightBytes.length);

	for (let index = 0; index < length; index += 1) {
		diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
	}

	return diff === 0;
}
