import { NextResponse } from "next/server";
import { createGmailState, gmailAuthorizationUrl } from "@/lib/gmail";

export async function GET() {
  try { return NextResponse.redirect(gmailAuthorizationUrl(await createGmailState())); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Gmail is not configured" }, { status: 503 }); }
}
