import { NextResponse } from "next/server";
import { startDailyAutomation } from "@/lib/automation";

export async function POST() {
  try { return NextResponse.json(await startDailyAutomation("manual")); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Automation failed" }, { status: 500 }); }
}
