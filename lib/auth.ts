import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { env } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "jobdesk_session";
const SESSION_AGE_SECONDS = 12 * 60 * 60;

export function normalizePasswordHash(value?: string) {
  let normalized = value?.trim() ?? "";
  const quote = normalized[0];
  if ((quote === '"' || quote === "'") && normalized.at(-1) === quote) {
    normalized = normalized.slice(1, -1);
  }
  // .env files escape dollar signs to prevent dotenv expansion. Vercel's
  // dashboard stores those backslashes literally when the same text is pasted.
  return normalized.replaceAll("\\$", "$");
}

function sessionKey() {
  if (!env.SESSION_SIGNING_KEY) throw new Error("SESSION_SIGNING_KEY is not configured.");
  return new TextEncoder().encode(env.SESSION_SIGNING_KEY);
}

export async function verifyPassword(password: string) {
  if (!env.ADMIN_PASSWORD_HASH) return false;
  const [algorithm, salt, expectedHex] = normalizePasswordHash(env.ADMIN_PASSWORD_HASH).split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSessionToken() {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("single-user")
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_AGE_SECONDS)
    .sign(sessionKey());
}

export async function verifySessionToken(token?: string | null) {
  if (!token || !env.SESSION_SIGNING_KEY) return false;
  try {
    const { payload } = await jwtVerify(token, sessionKey(), { algorithms: ["HS256"] });
    return payload.sub === "single-user" && payload.role === "admin";
  } catch {
    return false;
  }
}

export async function isAuthenticated() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_AGE_SECONDS,
  };
}

const fallbackAttempts = new Map<string, number[]>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 6;

function ipHash(ip: string) {
  return createHash("sha256").update(`${env.SESSION_SIGNING_KEY ?? "dev"}:${ip}`).digest("hex");
}

export async function canAttemptLogin(ip: string) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { count, error } = await supabase
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash(ip))
      .gte("created_at", since);
    if (!error) return (count ?? 0) < MAX_FAILURES;
  }
  const attempts = (fallbackAttempts.get(ip) ?? []).filter((time) => time > Date.now() - WINDOW_MS);
  fallbackAttempts.set(ip, attempts);
  return attempts.length < MAX_FAILURES;
}

export async function recordLoginFailure(ip: string) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from("login_attempts").insert({ ip_hash: ipHash(ip) });
    return;
  }
  const attempts = fallbackAttempts.get(ip) ?? [];
  attempts.push(Date.now());
  fallbackAttempts.set(ip, attempts);
}

export async function clearLoginFailures(ip: string) {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from("login_attempts").delete().eq("ip_hash", ipHash(ip));
  }
  fallbackAttempts.delete(ip);
}
