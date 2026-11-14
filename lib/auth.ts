import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "telemetry_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export function isAuthConfigured(): boolean {
  return Boolean(
    process.env.DASHBOARD_PASSWORD &&
    process.env.DASHBOARD_PASSWORD.length >= 12 &&
    process.env.SESSION_SECRET &&
    process.env.SESSION_SECRET.length >= 32,
  );
}

function signature(expiresAt: string, secret: string): string {
  return createHmac("sha256", secret).update(expiresAt).digest("base64url");
}

export function createSessionToken(secret: string, now = Date.now()): string {
  const expiresAt = String(Math.floor(now / 1000) + SESSION_TTL_SECONDS);
  return `${expiresAt}.${signature(expiresAt, secret)}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): boolean {
  if (!token || !secret || secret.length < 32) return false;
  const [expiresAt, suppliedSignature, extra] = token.split(".");
  if (!expiresAt || !suppliedSignature || extra || !/^\d{10}$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= Math.floor(now / 1000)) return false;

  const expected = Buffer.from(signature(expiresAt, secret));
  const supplied = Buffer.from(suppliedSignature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function readSessionCookie(cookieHeader: string | null): string | undefined {
  const cookie = cookieHeader
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return cookie?.slice(SESSION_COOKIE.length + 1);
}

export function requestHasSession(request: Request): boolean {
  return verifySessionToken(
    readSessionCookie(request.headers.get("cookie")),
    process.env.SESSION_SECRET,
  );
}

export function matchesSecret(supplied: unknown, expected: string): boolean {
  if (typeof supplied !== "string") return false;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}