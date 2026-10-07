import { NextRequest, NextResponse } from "next/server";
import { startDailyAutomation } from "@/lib/automation";
import { env } from "@/lib/env";
import { timingSafeEqual } from "node:crypto";

function validSecret(value: string | null) {
  if (!value?.startsWith("Bearer ") || !env.AUTOMATION_SHARED_SECRET) return false;
  const actual = Buffer.from(value.slice(7));
  const expected = Buffer.from(env.AUTOMATION_SHARED_SECRET);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: NextRequest) {
  if (!validSecret(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await startDailyAutomation("scheduled")); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Automation failed" }, { status: 500 }); }
}
