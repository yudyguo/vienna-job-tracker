import { NextRequest, NextResponse } from "next/server";
import { canAttemptLogin, clearLoginFailures, createSessionToken, recordLoginFailure, sessionCookieOptions, SESSION_COOKIE, verifyPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  if (!(await canAttemptLogin(ip))) return NextResponse.json({ error: "尝试次数过多，请 15 分钟后再试。" }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.password !== "string" || !(await verifyPassword(body.password))) {
    await recordLoginFailure(ip);
    await new Promise((resolve) => setTimeout(resolve, 700 + Math.floor(Math.random() * 500)));
    return NextResponse.json({ error: "口令不正确。" }, { status: 401 });
  }
  await clearLoginFailures(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions());
  return response;
}
