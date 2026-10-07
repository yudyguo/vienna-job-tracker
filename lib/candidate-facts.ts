import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { candidateFacts as fallbackFacts } from "@/lib/sample-data";
import type { CandidateFact } from "@/lib/types";

export async function listCandidateFacts(): Promise<CandidateFact[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return fallbackFacts;
  const { data, error } = await supabase.from("candidate_facts").select("*").order("category");
  if (error) throw new Error(`Could not load CandidateFacts: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    category: row.category,
    label: row.label,
    value: row.value,
    evidence: row.evidence,
    verified: row.verified,
    source: row.source,
  }));
}
