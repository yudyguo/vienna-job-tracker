import "server-only";
import { deepSeekProvider, PROMPT_VERSION } from "@/lib/ai/deepseek-provider";
import { listCandidateFacts } from "@/lib/candidate-facts";
import { coverLetterDocx, resumeDocx } from "@/lib/documents/docx";
import { compileTypstPdf } from "@/lib/documents/pdf";
import { renderCoverLetterTypst, renderResumeTypst } from "@/lib/documents/typst";
import { env } from "@/lib/env";
import { getJob } from "@/lib/repositories";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { GeneratedCoverLetterContent, GeneratedResumeContent, MaterialKind } from "@/lib/types";

function bytes(value: string | Uint8Array) {
  return typeof value === "string" ? new TextEncoder().encode(value) : value;
}

const mime = {
  json: "application/json",
  typ: "text/plain",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

async function saveMaterial(input: {
  jobId: string;
  kind: MaterialKind;
  language: "en" | "de";
  content: GeneratedResumeContent | GeneratedCoverLetterContent;
  typstSource: string;
  docx: Uint8Array;
  factIds: string[];
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data: material, error: materialError } = await supabase.from("materials").upsert({ job_id: input.jobId, kind: input.kind, language: input.language }, { onConflict: "job_id,kind,language" }).select("id").single();
  if (materialError) throw new Error(`Could not create material: ${materialError.message}`);
  const { data: latest } = await supabase.from("material_versions").select("version").eq("material_id", material.id).order("version", { ascending: false }).limit(1).maybeSingle();
  const version = Number(latest?.version ?? 0) + 1;
  const base = `${input.jobId}/${input.kind}/${input.language}/v${version}`;
  const pdf = await compileTypstPdf(input.typstSource);
  const files = [
    { format: "json" as const, path: `${base}/content.json`, data: bytes(JSON.stringify(input.content, null, 2)), status: "draft" },
    { format: "typ" as const, path: `${base}/source.typ`, data: bytes(input.typstSource), status: "draft" },
    { format: "docx" as const, path: `${base}/document.docx`, data: input.docx, status: "draft" },
    { format: "pdf" as const, path: `${base}/document.pdf`, data: pdf, status: pdf ? "draft" : "compile_pending" },
  ];
  for (const file of files) {
    let storagePath: string | null = null;
    if (file.data) {
      const { error: uploadError } = await supabase.storage.from("job-materials").upload(file.path, file.data, { contentType: mime[file.format], upsert: false });
      if (uploadError) throw new Error(`Could not upload ${file.format}: ${uploadError.message}`);
      storagePath = file.path;
    }
    const { error } = await supabase.from("material_versions").insert({
      material_id: material.id,
      version,
      format: file.format,
      status: file.status,
      storage_path: storagePath,
      content_json: file.format === "json" ? input.content : null,
      model: env.DEEPSEEK_QUALITY_MODEL,
      prompt_version: PROMPT_VERSION,
      fact_ids: input.factIds,
      generation_metadata: { humanReviewRequired: true },
      audit_source: "deepseek",
    });
    if (error) throw new Error(`Could not version material: ${error.message}`);
  }
  return { materialId: material.id, version, pdfCompiled: Boolean(pdf) };
}

export async function generateMaterialBundle(jobId: string, options?: { deepRewrite?: boolean }) {
  if (!env.DEEPSEEK_API_KEY) throw new Error("DeepSeek is not configured.");
  const job = await getJob(jobId);
  if (!job) throw new Error("Job not found.");
  if (job.jdQuality !== "full") throw new Error("A complete JD is required before generating application materials.");
  if (job.score < 80 || job.blockers.length) throw new Error("Job does not meet the 80-point, no-blocker generation threshold.");
  const facts = await listCandidateFacts();
  const bundle = await deepSeekProvider.generateMaterials(job, facts, options);
  const resumeFactIds = [...new Set(bundle.resume.factIds)];
  const results = [];
  for (const kind of ["resume_ats", "resume_hallmark"] as const) {
    results.push(await saveMaterial({ jobId, kind, language: "en", content: bundle.resume, typstSource: renderResumeTypst(bundle.resume, kind === "resume_ats" ? "ats" : "hallmark"), docx: await resumeDocx(bundle.resume), factIds: resumeFactIds }));
  }
  results.push(await saveMaterial({ jobId, kind: "cover_letter", language: bundle.coverLetter.language, content: bundle.coverLetter, typstSource: renderCoverLetterTypst(bundle.coverLetter, job.company), docx: await coverLetterDocx(bundle.coverLetter, job.company), factIds: [...new Set(bundle.coverLetter.factIds)] }));
  if (bundle.englishReviewCopy) results.push(await saveMaterial({ jobId, kind: "cover_letter", language: "en", content: bundle.englishReviewCopy, typstSource: renderCoverLetterTypst(bundle.englishReviewCopy, job.company), docx: await coverLetterDocx(bundle.englishReviewCopy, job.company), factIds: [...new Set(bundle.englishReviewCopy.factIds)] }));
  const supabase = getSupabaseAdmin();
  await supabase?.from("jobs").update({ status: "materials_ready", audit_source: "generation" }).eq("id", jobId);
  return results;
}
