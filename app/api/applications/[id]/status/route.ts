import { NextRequest, NextResponse } from "next/server";
import { updateApplicationStage } from "@/lib/applications/service";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { ApplicationStage } from "@/lib/types";

const stages = new Set<ApplicationStage>(["needs_match", "applied", "interview", "task", "offer", "rejected", "archived"]);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await request.json() as { status?: ApplicationStage; nextAction?: string | null; nextActionAt?: string | null; note?: string | null };
    if (!body.status || !stages.has(body.status)) return NextResponse.json({ error: "Invalid application status" }, { status: 422 });
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Supabase is not configured.");
    let applicationId = id;
    const { data: existing } = await supabase.from("applications").select("id").eq("id", id).maybeSingle();
    if (!existing) {
      const { data: byJob } = await supabase.from("applications").select("id").eq("job_id", id).maybeSingle();
      if (byJob) applicationId = String(byJob.id);
      else {
        const { data: created, error } = await supabase.from("applications").insert({ job_id: id, status: "needs_match", stage_source: "manual" }).select("id").single();
        if (error) throw new Error(error.message);
        applicationId = String(created.id);
      }
    }
    const result = await updateApplicationStage({ applicationId, stage: body.status, source: "manual", note: body.note, nextAction: body.nextAction, nextActionAt: body.nextActionAt, requiresReview: false });
    return NextResponse.json({ ok: true, applicationId, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update application" }, { status: 500 });
  }
}
