import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const { data: version, error } = await supabase.from("material_versions").select("storage_path").eq("id", id).maybeSingle();
  if (error || !version?.storage_path) return NextResponse.json({ error: "File not found" }, { status: 404 });
  const { data, error: signError } = await supabase.storage.from("job-materials").createSignedUrl(version.storage_path, 300);
  if (signError) return NextResponse.json({ error: signError.message }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
