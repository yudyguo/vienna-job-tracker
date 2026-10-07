"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";
import type { Job } from "@/lib/types";
import { ApplicationStageControls } from "@/components/application-stage-controls";
import { StatusBadge } from "@/components/status-badge";
import { RetryScoringButton } from "@/components/retry-scoring-button";
import { ListingAvailabilityButton } from "@/components/listing-availability-button";

const formatter = new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "short" });

export function Score({ value }: { value: number }) {
  return (
    <span className="score" data-band={value >= 80 ? "high" : value >= 65 ? "medium" : "low"}>
      <strong>{value}</strong><small>/100</small>
    </span>
  );
}

function ScoringIndicator({ job }: { job: Job }) {
  if (job.scoringStatus === "failed") {
    return <div className="scoring-failure"><span className="scoring-failed" title={job.scoringError ?? "评分失败"}>评分失败</span><RetryScoringButton jobId={job.id} /></div>;
  }
  if (job.scoringStatus === "queued" || job.scoringStatus === "scoring") {
    return (
      <div className="scoring-indicator">
        <span>{job.scoringStatus === "queued" ? "等待评分" : "评分中"}</span>
        <span className="scoring-progress" role="progressbar" aria-label={job.scoringStatus === "queued" ? "等待评分" : "正在评分"} />
      </div>
    );
  }
  return <Score value={job.score} />;
}

export function JobTable({ jobs, compact = false, filters = false, editableStage = false }: { jobs: Job[]; compact?: boolean; filters?: boolean; editableStage?: boolean }) {
  const [listingOverrides, setListingOverrides] = useState<Record<string, Job["listingStatus"]>>({});
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("all");
  const [match, setMatch] = useState("all");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");
  const [showMailRecords, setShowMailRecords] = useState(false);
  const hiddenMailCount = useMemo(() => jobs.filter((job) => job.inboxKind === "mail_low_signal").length, [jobs]);
  const candidateJobs = useMemo(
    () => showMailRecords ? jobs : jobs.filter((job) => job.inboxKind !== "mail_low_signal"),
    [jobs, showMailRecords],
  );
  const locationOptions = useMemo(() => [...new Set(candidateJobs.map((job) => job.location).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [candidateJobs]);
  if (!jobs.length) {
    return (
      <div className="empty-state">
        <BriefcaseEmpty />
        <h2>还没有职位</h2>
        <p>连接职位提醒或粘贴第一份 JD，系统会在这里完成去重和评分。</p>
        <Link className="button button--outline" href="/jobs">添加职位</Link>
      </div>
    );
  }
  const displayJobs = candidateJobs
    .map((job) => listingOverrides[job.id] ? { ...job, listingStatus: listingOverrides[job.id] } : job)
    .filter((job) => {
      if (!filters) return true;
      const normalizedQuery = query.trim().toLowerCase();
      if (normalizedQuery && !`${job.title} ${job.company}`.toLowerCase().includes(normalizedQuery)) return false;
      if (location !== "all" && job.location !== location) return false;
      if (match === "high" && job.score < 80) return false;
      if (match === "medium" && (job.score < 65 || job.score >= 80)) return false;
      if (match === "low" && job.score >= 65) return false;
      const effectiveStatus = job.listingStatus === "closed" ? "closed" : job.applicationStage ?? job.status;
      if (status !== "all" && effectiveStatus !== status) return false;
      if (kind !== "all" && job.inboxKind !== kind) return false;
      return true;
    })
    .sort((left, right) => {
      const inboxPriority = inboxKindPriority(right) - inboxKindPriority(left);
      if (inboxPriority !== 0) return inboxPriority;
      const priority = applicationPriority(right) - applicationPriority(left);
      if (priority !== 0) return priority;
      return right.score - left.score;
    });
  return (
    <div className="job-table-stack">
      {filters && hiddenMailCount ? (
        <div className="mail-records-note" role="status">
          <div><strong>{showMailRecords ? "邮件记录已展开" : `已自动隐藏 ${hiddenMailCount} 条低价值确认记录`}</strong><span>明确的岗位推介已归入独立类别；无效广告和账号通知不会保留为职位。有面试、作业、Offer 或拒信的记录始终显示。</span></div>
          <button className="mail-records-toggle" type="button" aria-pressed={showMailRecords} onClick={() => setShowMailRecords((current) => !current)}>{showMailRecords ? "收起邮件记录" : "显示邮件记录"}</button>
        </div>
      ) : null}
      {filters ? <div className="job-filters" aria-label="筛选职位">
        <label><span>职位或公司</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如 Product Designer" /></label>
        <label><span>地点</span><select value={location} onChange={(event) => setLocation(event.target.value)}><option value="all">全部地点</option>{locationOptions.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        <label><span>匹配分</span><select value={match} onChange={(event) => setMatch(event.target.value)}><option value="all">全部分数</option><option value="high">80–100 · 高匹配</option><option value="medium">65–79 · 可考虑</option><option value="low">0–64 · 低匹配</option></select></label>
        <label><span>信息类别</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="all">全部类别</option><option value="opportunity">直接职位</option><option value="recommendation">岗位推介</option><option value="mail_actionable">申请进展</option><option value="mail_low_signal">确认记录</option></select></label>
        <label><span>状态</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option><option value="new">新职位</option><option value="shortlisted">已入围</option><option value="materials_ready">材料就绪</option><option value="reviewed">已审核</option><option value="applied">已投递</option><option value="interview">面试</option><option value="task">作业</option><option value="offer">Offer</option><option value="rejected">已拒绝</option><option value="archived">已归档</option><option value="closed">停止招聘</option></select></label>
        <div className="job-filters__result"><strong>{displayJobs.length}</strong><span> / {candidateJobs.length} 个职位</span>{query || location !== "all" || match !== "all" || status !== "all" || kind !== "all" ? <button type="button" onClick={() => { setQuery(""); setLocation("all"); setMatch("all"); setStatus("all"); setKind("all"); }}>清除筛选</button> : null}</div>
      </div> : null}
      <div className="table-wrap">
      <table className="job-table">
        <thead>
          <tr>
            <th scope="col">职位</th>
            {!compact ? <th scope="col">地点</th> : null}
            <th scope="col">匹配</th>
            <th scope="col">状态</th>
            <th scope="col">发布</th>
            <th scope="col"><span className="sr-only">操作</span></th>
          </tr>
        </thead>
        <tbody>
          {displayJobs.map((job) => (
            <tr key={job.id} data-listing-status={job.listingStatus} data-inbox-kind={job.inboxKind}>
              <td data-label="职位">
                <Link className="job-title" href={`/jobs/${job.id}`}>{job.title}</Link>
                <span className="job-company">{job.company}</span>
                <div className="tag-row">
                  {job.listingStatus === "closed" ? <span className="tag tag--closed">已停止招聘</span> : null}
                  {job.inboxKind === "mail_low_signal" ? <span className="tag">邮件记录</span> : null}
                  {job.inboxKind === "recommendation" ? <span className="tag tag--recommendation">岗位推介</span> : null}
                  {job.applicationStage === "offer" || job.applicationStage === "interview" || job.applicationStage === "task" ? <span className="tag tag--priority">{job.applicationStage === "offer" ? "Offer" : job.applicationStage === "interview" ? "面试" : "作业"}</span> : null}
                  {job.applicationRequiresReview ? <span className="tag tag--review">待确认邮件</span> : null}
                  {job.tags.filter((tag) => tag !== "岗位推介").slice(0, compact ? 2 : 4).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                </div>
              </td>
              {!compact ? <td data-label="地点"><span>{job.location}</span><small>{job.remotePolicy}</small></td> : null}
              <td data-label="匹配"><ScoringIndicator job={job} /></td>
              <td data-label="状态">{editableStage && job.listingStatus !== "closed" ? <ApplicationStageControls id={job.id} stage={job.applicationStage} compact allowCreateSelect /> : job.listingStatus === "closed" ? <span className="status" data-status="closed">已停止招聘</span> : job.applicationStage ? <StatusBadge status={job.applicationStage} /> : job.scoringStatus === "completed" ? <StatusBadge status={job.status} /> : <span className="status" data-status={job.scoringStatus === "failed" ? "failed" : "draft"}>{job.scoringStatus === "failed" ? "评分失败" : "评分中"}</span>}{job.applicationNextAction ? <small className="job-next-action">{job.applicationNextAction}</small> : null}</td>
              <td data-label="发布"><time dateTime={job.publishedAt}>{formatter.format(new Date(job.publishedAt))}</time></td>
              <td className="job-table__action">
                <div className="job-table__actions">
                  {job.sourceUrl ? (
                    <a className="icon-button" href={job.sourceUrl} target="_blank" rel="noreferrer" aria-label={`打开 ${job.title} 原始页面`} title="打开原职位">
                      <ExternalLink aria-hidden="true" size={17} />
                    </a>
                  ) : <Link className="table-link" href={`/jobs/${job.id}`}>查看 →</Link>}
                  <ListingAvailabilityButton
                    jobId={job.id}
                    status={job.listingStatus}
                    compact
                    disabled={Boolean(job.isDemo)}
                    onStatusChange={(listingStatus) => setListingOverrides((current) => ({ ...current, [job.id]: listingStatus }))}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!displayJobs.length ? <div className="filter-empty"><strong>没有符合条件的职位</strong><p>调整或清除筛选条件后再试。</p></div> : null}
      </div>
    </div>
  );
}

function inboxKindPriority(job: Job) {
  if (job.inboxKind === "mail_actionable") return 4;
  if (job.inboxKind === "opportunity") return 3;
  if (job.inboxKind === "recommendation") return 2;
  return 1;
}

function applicationPriority(job: Job) {
  if (job.listingStatus === "closed" || job.applicationStage === "rejected") return -10;
  if (job.applicationStage === "offer") return 60;
  if (job.applicationStage === "interview" || job.applicationStage === "task") return 50;
  if (job.applicationStage === "applied" && job.applicationNextAction) return 40;
  return 0;
}

function BriefcaseEmpty() {
  return <div className="empty-state__mark" aria-hidden="true">JD</div>;
}
