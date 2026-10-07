import "server-only";
import { env } from "@/lib/env";
import type { RawJob } from "@/lib/jobs/ingest";

function ids(value: string) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function text(html: string) { return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(); }

async function fetchJson(url: string) {
  const response = await fetch(url, { headers: { "user-agent": "ViennaJobDesk/1.0 (personal job alert aggregator)" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Job source returned ${response.status}: ${url}`);
  return response.json() as Promise<unknown>;
}

async function greenhouse(board: string): Promise<RawJob[]> {
  const payload = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`) as { jobs?: Array<Record<string, unknown>> };
  return (payload.jobs ?? []).map((job) => ({
    company: board,
    title: String(job.title ?? ""),
    location: String((job.location as Record<string, unknown> | undefined)?.name ?? "Not specified"),
    jdText: text(String(job.content ?? "")),
    source: "greenhouse",
    sourceUrl: String(job.absolute_url ?? "") || null,
    externalId: String(job.id ?? ""),
    publishedAt: String(job.updated_at ?? "") || null,
  }));
}

async function lever(site: string): Promise<RawJob[]> {
  const payload = await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`) as Array<Record<string, unknown>>;
  return payload.map((job) => ({
    company: site,
    title: String(job.text ?? ""),
    location: String((job.categories as Record<string, unknown> | undefined)?.location ?? "Not specified"),
    jdText: text(`${job.descriptionPlain ?? job.description ?? ""} ${job.additionalPlain ?? ""}`),
    source: "lever",
    sourceUrl: String(job.hostedUrl ?? "") || null,
    externalId: String(job.id ?? ""),
    publishedAt: null,
  }));
}

async function ashby(board: string): Promise<RawJob[]> {
  const payload = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`) as { jobs?: Array<Record<string, unknown>> };
  return (payload.jobs ?? []).map((job) => ({
    company: board,
    title: String(job.title ?? ""),
    location: String(job.location ?? "Not specified"),
    jdText: text(String(job.descriptionPlain ?? job.descriptionHtml ?? "")),
    source: "ashby",
    sourceUrl: String(job.jobUrl ?? job.applyUrl ?? "") || null,
    externalId: String(job.id ?? job.jobUrl ?? ""),
    publishedAt: String(job.publishedAt ?? "") || null,
  }));
}

export async function fetchPublicAtsJobs() {
  const tasks = [
    ...ids(env.GREENHOUSE_BOARDS).map((id) => greenhouse(id)),
    ...ids(env.LEVER_SITES).map((id) => lever(id)),
    ...ids(env.ASHBY_BOARDS).map((id) => ashby(id)),
  ];
  const settled = await Promise.allSettled(tasks);
  const jobs = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const errors = settled.flatMap((result) => result.status === "rejected" ? [String(result.reason)] : []);
  return { jobs, errors };
}
