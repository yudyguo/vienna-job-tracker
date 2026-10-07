import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const availabilitySchema = z.object({
  status: z.enum(["active", "closed"]),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsed = availabilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid listing status" }, { status: 400 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });

  const now = new Date().toISOString();
  const { data: job, error } = await supabase
    .from("jobs")
    .update({
      listing_status: parsed.data.status,
      listing_status_source: "manual",
      listing_checked_at: now,
      listing_closed_at: parsed.data.status === "closed" ? now : null,
      audit_source: "manual_listing_availability",
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const { count } = await supabase
    .from("job_versions")
    .select("id", { count: "exact", head: true })
    .eq("job_id", id);
  const { error: versionError } = await supabase.from("job_versions").insert({
    job_id: id,
    version: (count ?? 0) + 1,
    snapshot: job,
    source: "manual_listing_availability",
  });
  return NextResponse.json({
    id,
    listingStatus: parsed.data.status,
    listingCheckedAt: now,
    listingClosedAt: parsed.data.status === "closed" ? now : null,
    warning: versionError ? "Status saved, but the audit version could not be recorded" : null,
  });
}
