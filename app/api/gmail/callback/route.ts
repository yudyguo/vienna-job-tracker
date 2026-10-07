import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { saveGmailConnection, verifyGmailState } from "@/lib/gmail";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const base = env.APP_URL ?? request.nextUrl.origin;
  if (!code || !state || !(await verifyGmailState(state))) return NextResponse.redirect(new URL("/settings?gmail=invalid", base));
  try { await saveGmailConnection(code); return NextResponse.redirect(new URL("/settings?gmail=connected", base)); }
  catch { return NextResponse.redirect(new URL("/settings?gmail=failed", base)); }
}
