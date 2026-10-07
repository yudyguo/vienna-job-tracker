import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE = "jobdesk_session";
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/automation/daily", "/api/automation/mail-sync", "/api/gmail/callback"];

async function validSession(request: NextRequest) {
  const token = request.cookies.get(COOKIE)?.value;
  const secret = process.env.SESSION_SIGNING_KEY;
  if (!token || !secret) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return payload.sub === "single-user" && payload.role === "admin";
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/.well-known/workflow/")) return NextResponse.next();
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico") return NextResponse.next();
  if (await validSession(request)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|robots.txt|sitemap.xml|.well-known/workflow/).*)"],
};
