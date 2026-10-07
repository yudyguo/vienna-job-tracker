import { fetchPublicAtsJobs } from "@/lib/sources/public-ats";
import { ingestJob } from "@/lib/jobs/ingest";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { generateMaterialBundle } from "@/lib/materials/generate";
import { fetchGmailAlertJobs, sendGmailDigest } from "@/lib/gmail";
import { selectAutomaticGenerationQueue } from "@/lib/generation-policy";

export interface DailyWorkflowInput { runId: string; localDate: string; trigger: "scheduled" | "manual"; }

async function markRun(runId: string, values: Record<string, unknown>) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from("automation_runs").update(values).eq("id", runId);
  if (error) throw new Error(error.message);
}

async function readSources() {
  "use step";
  const ats = await fetchPublicAtsJobs();
  try { return { jobs: [...ats.jobs, ...await fetchGmailAlertJobs()], errors: ats.errors }; }
  catch (error) { return { jobs: ats.jobs, errors: [...ats.errors, error instanceof Error ? error.message : "Gmail read failed"] }; }
}

async function ingestSources(jobs: Awaited<ReturnType<typeof fetchPublicAtsJobs>>["jobs"]) {
  "use step";
  const imported: Array<{ id: string; score: number; blockers: string[] }> = [];
  for (const raw of jobs) {
    try {
      const row = await ingestJob(raw, "daily_workflow");
      imported.push({ id: row.id, score: Number(row.score), blockers: Array.isArray(row.blockers) ? row.blockers.map(String) : [] });
    } catch (error) {
      console.warn("job_ingest", { source: raw.source, externalId: raw.externalId, status: "error", error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
  return imported;
}

async function generateTopMaterials(jobs: Array<{ id: string; score: number; blockers: string[] }>) {
  "use step";
  const eligible = selectAutomaticGenerationQueue(jobs, 3);
  let generated = 0;
  for (const job of eligible) {
    try { await generateMaterialBundle(job.id); generated += 1; }
    catch (error) { console.warn("material_generation", { jobId: job.id, status: "error", error: error instanceof Error ? error.message : "Unknown error" }); }
  }
  return { eligible: eligible.length, generated };
}

async function sendDigest(localDate: string, imported: Array<{ id: string; score: number; blockers: string[] }>, generated: number) {
  "use step";
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const high = imported.filter((job) => job.score >= 80 && job.blockers.length === 0).sort((a, b) => b.score - a.score);
  if (!high.length) return;
  const { data } = await supabase.from("jobs").select("title,company,score").in("id", high.map((job) => job.id)).order("score", { ascending: false });
  const lines = (data ?? []).map((job) => `${job.score}/100 · ${job.title} · ${job.company}`);
  await sendGmailDigest(`Vienna Job Desk · ${high.length} 个高匹配职位`, [`${localDate} 自动化汇总`, "", ...lines, "", `已生成 ${generated} 个职位的材料草稿。请在工作台中审核；系统不会自动投递。`].join("\n"));
}

export async function dailyJobWorkflow(input: DailyWorkflowInput) {
  "use workflow";
  await markRun(input.runId, { status: "running" });
  const sourceResult = await readSources();
  const imported = await ingestSources(sourceResult.jobs);
  const uniqueIds = new Set(imported.map((job) => job.id));
  const materialResult = await generateTopMaterials(imported);
  await sendDigest(input.localDate, imported, materialResult.generated);
  const status = sourceResult.errors.length || materialResult.generated < materialResult.eligible ? "partial" : "completed";
  await markRun(input.runId, {
    status,
    discovered: sourceResult.jobs.length,
    deduplicated: sourceResult.jobs.length - uniqueIds.size,
    high_score: imported.filter((job) => job.score >= 80 && job.blockers.length === 0).length,
    generated: materialResult.generated,
    error: sourceResult.errors.length ? sourceResult.errors.slice(0, 4).join("\n") : null,
    completed_at: new Date().toISOString(),
  });
  return { status, discovered: sourceResult.jobs.length, imported: uniqueIds.size, generated: materialResult.generated };
}
