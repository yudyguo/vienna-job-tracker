import { NextRequest, NextResponse } from "next/server";
import { cleanEmailText } from "@/lib/email/parser";
import { startJobScoring } from "@/lib/jobs/start-scoring";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const body = await request.json() as { jdText?: string; sourceUrl?: string | null };
    const jdText = cleanEmailText(body.jdText ?? "");
    if (jdText.length < 250) return NextResponse.json({ error: "完整 JD 至少需要 250 个字符。" }, { status: 422 });
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data: current, error: currentError } = await supabase.from("jobs").select("*").eq("id", id).single();
    if (currentError) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const { count } = await supabase.from("job_versions").select("id", { count: "exact", head: true }).eq("job_id", id);
    await supabase.from("job_versions").insert({ job_id: id, version: (count ?? 0) + 1, snapshot: current, source: "manual_jd_before_replace" });
    const { error } = await supabase.from("jobs").update({
      jd_text: jdText,
      jd_quality: "full",
      parser_version: "manual-jd-2026-08-11.1",
      source_url: body.sourceUrl === undefined ? current.source_url : body.sourceUrl,
      scoring_status: "queued",
      scoring_error: null,
      match_reasons: [],
      audit_source: "manual_jd_update",
    }).eq("id", id);
    if (error) throw new Error(error.message);
    const workflowRunId = await startJobScoring(id);
    return NextResponse.json({ ok: true, workflowRunId }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update JD" }, { status: 500 });
  }
}
