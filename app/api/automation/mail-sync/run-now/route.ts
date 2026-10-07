import { NextRequest, NextResponse } from "next/server";
import { startMailSyncAutomation } from "@/lib/automation";
import { rebuildGmailAlertJobs } from "@/lib/jobs/rebuild-gmail";
import { getGmailConnectionHealth } from "@/lib/repositories";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { backfill?: boolean; days?: number; rebuildJobs?: boolean; query?: string };
    if (body.rebuildJobs) return NextResponse.json(await rebuildGmailAlertJobs());
    const gmailHealth = await getGmailConnectionHealth();
    if (gmailHealth.status !== "active") {
      return NextResponse.json({
        error: gmailHealth.status === "reauthorization_required"
          ? "Gmail 授权已过期，请先在设置页重新授权。"
          : "Gmail 尚未连接，请先在设置页完成授权。",
      }, { status: 409 });
    }
    const trigger = body.backfill ? "backfill" : "manual";
    const gmailQuery = body.backfill && typeof body.query === "string" ? body.query.trim().slice(0, 300) || undefined : undefined;
    return NextResponse.json(await startMailSyncAutomation(trigger, body.backfill ? Math.min(Math.max(body.days ?? 90, 1), 365) : undefined, gmailQuery), { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mail sync failed" }, { status: 500 });
  }
}
