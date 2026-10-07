import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const { data: version, error: versionError } = await supabase
    .from("material_versions")
    .select("material_id, version")
    .eq("id", id)
    .maybeSingle();
  if (versionError) return NextResponse.json({ error: versionError.message }, { status: 500 });
  if (!version) return NextResponse.json({ error: "Material version not found" }, { status: 404 });

  const { data: reviewed, error } = await supabase
    .from("material_versions")
    .update({ status: "reviewed", reviewed_at: new Date().toISOString(), audit_source: "manual_review" })
    .eq("material_id", version.material_id)
    .eq("version", version.version)
    .eq("status", "draft")
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reviewed: reviewed?.length ?? 0 });
}
