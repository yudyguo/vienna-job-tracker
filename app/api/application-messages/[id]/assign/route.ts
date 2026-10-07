import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const { jobId } = await request.json() as { jobId?: string };
    if (!jobId) return NextResponse.json({ error: "jobId is required" }, { status: 422 });
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data: message, error: messageError } = await supabase.from("application_messages").select("*, applications!inner(id,job_id,status)").eq("id", id).single();
    if (messageError) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    const oldApplication = message.applications as unknown as { id: string; job_id: string; status: string };
    let { data: target } = await supabase.from("applications").select("id,status").eq("job_id", jobId).maybeSingle();
    if (!target) {
      const created = await supabase.from("applications").insert({ job_id: jobId, status: oldApplication.status === "needs_match" ? "applied" : oldApplication.status, stage_source: "manual_assign" }).select("id,status").single();
      if (created.error) throw new Error(created.error.message);
      target = created.data;
    }
    const { error: moveError } = await supabase.from("application_messages").update({ application_id: target.id, match_confidence: 1, requires_review: false }).eq("id", id);
    if (moveError) throw new Error(moveError.message);
    await supabase.from("applications").update({ latest_message_at: message.received_at, requires_review: false, match_confidence: 1, stage_source: "manual_assign" }).eq("id", target.id);
    await supabase.from("application_events").insert({ application_id: target.id, application_message_id: id, from_status: target.status, to_status: target.status, note: "Email assigned to the selected job", source: "manual_assign", metadata: { previousApplicationId: oldApplication.id } });
    const { count } = await supabase.from("application_messages").select("id", { count: "exact", head: true }).eq("application_id", oldApplication.id);
    if ((count ?? 0) === 0 && oldApplication.job_id !== jobId) {
      await supabase.from("jobs").update({ merged_into_job_id: jobId, status: "archived", audit_source: "manual_assign" }).eq("id", oldApplication.job_id);
      await supabase.from("applications").update({ status: "archived", stage_source: "manual_assign" }).eq("id", oldApplication.id);
    }
    return NextResponse.json({ ok: true, applicationId: target.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not assign message" }, { status: 500 });
  }
}
