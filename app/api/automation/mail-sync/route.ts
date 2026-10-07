import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { startMailSyncAutomation } from "@/lib/automation";
import { env } from "@/lib/env";
import { getGmailConnectionHealth } from "@/lib/repositories";

function validSecret(value: string | null) {
  if (!value?.startsWith("Bearer ") || !env.AUTOMATION_SHARED_SECRET) return false;
  const actual = Buffer.from(value.slice(7));
  const expected = Buffer.from(env.AUTOMATION_SHARED_SECRET);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: NextRequest) {
  if (!validSecret(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({})) as { backfill?: boolean; days?: number; query?: string };
    const gmailHealth = await getGmailConnectionHealth();
    if (gmailHealth.status !== "active") {
      return NextResponse.json({
        status: "paused",
        reason: gmailHealth.status === "reauthorization_required" ? "gmail_reauthorization_required" : "gmail_not_connected",
      }, { status: 202 });
    }
    const backfillDays = body.backfill ? Math.min(Math.max(body.days ?? 90, 1), 365) : undefined;
    const gmailQuery = body.backfill && typeof body.query === "string" ? body.query.trim().slice(0, 300) || undefined : undefined;
    return NextResponse.json(await startMailSyncAutomation(body.backfill ? "backfill" : "scheduled", backfillDays, gmailQuery), { status: 202 });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Mail sync failed" }, { status: 500 }); }
}
