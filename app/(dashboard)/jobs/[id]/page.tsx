import Link from "next/link";
import { CalendarClock, ExternalLink, Mail, MapPin, Sparkles, TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { ApplicationStageControls } from "@/components/application-stage-controls";
import { GenerateMaterialsButton } from "@/components/generate-materials-button";
import { JdUpdateForm } from "@/components/jd-update-form";
import { Score } from "@/components/job-table";
import { ListingAvailabilityButton } from "@/components/listing-availability-button";
import { PageHeader } from "@/components/page-header";
import { PreparationButton } from "@/components/preparation-button";
import { StatusBadge } from "@/components/status-badge";
import { getJobDossier } from "@/lib/repositories";
import type { ApplicationProcessStep } from "@/lib/types";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dossier = await getJobDossier(id);
  if (!dossier) notFound();
  const { job, application, messages, preparationPacks, processSteps, materialCount } = dossier;
  const latestMessage = messages[0];
  const isPlaceholder = job.source === "gmail_application" && /^(?:待认领的申请职位|application to claim)$/i.test(job.title.trim());
  const hasConfirmedApplicationMatch = Boolean(application && !application.requiresReview && Number(application.matchConfidence ?? 0) >= 0.9);
  const displayTitle = isPlaceholder ? application?.title ?? latestMessage?.extractedTitle ?? latestMessage?.subject ?? job.title : job.title;
  const displayCompany = isPlaceholder ? application?.company ?? latestMessage?.extractedCompany ?? job.company : job.company;
  const isClosed = job.listingStatus === "closed";
  const canGenerate = job.jdQuality === "full" && job.score >= 80 && job.blockers.length === 0 && !isClosed;
  const latestPack = preparationPacks[0];
  const visibleProcessSteps = collapseProcessSteps(processSteps);
  return (
    <>
      <PageHeader
        back={{ href: "/jobs", label: "职位收件箱" }}
        title={displayTitle}
        description={displayCompany}
        action={<div className="job-header-actions"><ApplicationStageControls id={application?.id ?? job.id} stage={application?.status} compact={!application} /><ListingAvailabilityButton jobId={job.id} status={job.listingStatus} disabled={Boolean(job.isDemo)} /><GenerateMaterialsButton jobId={job.id} disabled={!canGenerate || Boolean(job.isDemo)} /></div>}
      />
      <section className="job-hero reveal" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="job-hero__score"><Score value={job.score} /><span>综合匹配</span></div>
        <div><p className="eyebrow">Job state</p><StatusBadge status={job.status} /></div>
        <div><p className="eyebrow">Application</p>{application ? <span className="status" data-status={application.status}>{stageLabel(application.status)}</span> : <strong>尚未投递</strong>}</div>
        <div><p className="eyebrow">JD quality</p><strong>{job.jdQuality === "full" ? "完整" : job.jdQuality === "summary" ? "仅摘要" : "缺失"}</strong></div>
      </section>

      <section className="source-line source-line--primary reveal" style={{ "--i": 2 } as React.CSSProperties}>
        <span><MapPin aria-hidden="true" size={16} /> {job.location}</span>
        <span>来源：{job.source}</span>
        <span>{job.remotePolicy}</span>
        {job.sourceUrl ? <a className="text-link" href={job.sourceUrl} target="_blank" rel="noreferrer">{job.source === "gmail_application" ? "在 Gmail 打开" : "查看原职位"} <ExternalLink aria-hidden="true" size={14} /></a> : null}
      </section>

      {isPlaceholder && latestMessage ? <section className="application-clue reveal" style={{ "--i": 2 } as React.CSSProperties}>
        <header><div><p className="eyebrow">Email evidence</p><h2>当前可确认的信息</h2></div><span className="mail-type">{messageTypeLabel(latestMessage.classification)}</span></header>
        <dl>
          <div><dt>邮件主题</dt><dd>{latestMessage.subject}</dd></div>
          <div><dt>发件人</dt><dd>{latestMessage.senderName ?? latestMessage.senderEmail ?? "未知"}</dd></div>
          <div><dt>收到时间</dt><dd>{formatDate(latestMessage.receivedAt)}</dd></div>
          <div><dt>提取公司</dt><dd>{latestMessage.extractedCompany ?? job.company ?? "待确认"}</dd></div>
          <div><dt>提取职位</dt><dd>{latestMessage.extractedTitle ?? "邮件中没有明确职位名称"}</dd></div>
          <div><dt>分类置信度</dt><dd>{Math.round(latestMessage.classificationConfidence * 100)}%</dd></div>
        </dl>
        <p>{latestMessage.classification === "other"
          ? "这是一封账号、职位推荐或一般通知邮件，不应被当作一条待认领申请。记录保留用于审计。"
          : hasConfirmedApplicationMatch
            ? "系统已将这封邮件可靠归入当前公司的同一申请流程；邮件没有提供具体职位名称，补充完整 JD 后可完善职位信息和匹配评分。"
            : "系统尚未找到足够可靠的职位对应关系；可根据下面的邮件正文认领现有职位或补充 JD。"}</p>
        <a className="text-link" href={latestMessage.gmailUrl} target="_blank" rel="noreferrer">查看原邮件 <ExternalLink aria-hidden="true" size={14} /></a>
      </section> : null}

      {application ? <aside className="application-banner">
        <div><p className="eyebrow">Latest application state</p><strong>{stageLabel(application.status)}</strong>{application.nextAction ? <p><CalendarClock size={16} /> 下一步：{application.nextAction}</p> : null}</div>
        {application.requiresReview ? <span className="review-flag"><TriangleAlert size={15} /> 邮件分类或职位匹配待确认</span> : null}
      </aside> : null}

      {application ? <section className="dossier-section process-section">
        <div className="section-heading"><div><p className="eyebrow">Application journey</p><h2>岗位流程记录</h2></div><span>{visibleProcessSteps.length} 个阶段</span></div>
        {visibleProcessSteps.length ? <ol className="process-timeline">
          {visibleProcessSteps.map((step, index) => <li key={step.id} data-kind={step.kind}>
            <div className="process-timeline__marker"><span>{index + 1}</span></div>
            <article>
              <header><div><span className="process-kind">{processKindLabel(step.kind, step.roundNumber)}</span><h3>{step.title}</h3></div><time dateTime={step.scheduledAt ?? step.occurredAt}>{formatDate(step.scheduledAt ?? step.occurredAt)}</time></header>
              <p>{step.scheduledAt ? `安排时间：${formatDate(step.scheduledAt)}` : `记录时间：${formatDate(step.occurredAt)}`}{step.updateCount > 1 ? ` · 合并了 ${step.updateCount} 封更新/提醒` : ""}</p>
              {step.notes ? <small>{step.notes}</small> : null}
            </article>
          </li>)}
        </ol> : <p className="muted-copy">还没有流程步骤。收到投递确认、面试、作业或结果邮件后会自动记录；你在页面修改状态也会留下步骤。</p>}
      </section> : null}

      {application?.status === "archived" ? <aside className="notice"><span className="notice__mark" aria-hidden="true">×</span><div><strong>这条邮件记录已归档</strong><p>它不会再出现在待认领看板中，但原始邮件线索和审计记录仍可在本页查看。</p></div></aside> : isClosed ? <aside className="notice notice--closed"><span className="notice__mark" aria-hidden="true">×</span><div><strong>该职位已停止招聘</strong><p>它已经移到职位列表最后；如果职位重新开放，可以在上方恢复。</p></div></aside> : job.jdQuality !== "full" ? <aside className="notice notice--warning"><TriangleAlert aria-hidden="true" size={18} /><div><strong>{job.jdQuality === "summary" ? "JD 摘要不足" : "缺少完整 JD"}</strong><p>摘要职位的评分最高为 69，也不会生成材料。粘贴完整 JD 后会自动重新提取和评分。</p></div></aside> : !canGenerate ? <aside className="notice notice--warning"><Sparkles aria-hidden="true" size={18} /><div><strong>材料生成已暂停</strong><p>只有无阻断项且达到 80 分的完整 JD 职位会进入材料队列。</p></div></aside> : null}

      <section className="detail-grid reveal" style={{ "--i": 3 } as React.CSSProperties}>
        <article className="prose-card">
          <p className="eyebrow">Role brief</p>
          <h2>职位摘要</h2>
          <p>{isPlaceholder && latestMessage
            ? latestMessage.classification === "other"
              ? `这封来自 ${latestMessage.senderName ?? latestMessage.senderEmail ?? "未知发件人"} 的邮件没有包含可确认的具体职位或完整 JD，因此已作为通知邮件保留。`
              : hasConfirmedApplicationMatch
                ? `系统从邮件中识别到“${messageTypeLabel(latestMessage.classification)}”，并已根据公司与发件域归入当前申请流程。由于邮件未写明具体职位名称，仍需要补充完整 JD。`
                : `系统从邮件中识别到“${messageTypeLabel(latestMessage.classification)}”，但尚未可靠匹配到具体职位。请用邮件主题、公司和正文线索完成认领。`
            : job.summary || "尚未提取职位摘要。补全 JD 后可重新评分。"}</p>
        </article>
        <aside className="evidence-card">
          <p className="eyebrow">Evidence map</p>
          <h2>匹配依据</h2>
          {job.matchReasons.length ? <ul className="check-list">{job.matchReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <div className="evidence-empty"><p>{job.jdQuality === "full" ? "尚未生成匹配依据，可能是评分失败或没有找到可验证事实。" : "只有完整 JD 才会生成事实匹配依据。"}</p><a className="text-link" href="#jd-editor">补全 JD / 重新评分 →</a></div>}
          {job.blockers.length ? <><h3>阻断项</h3><ul className="warning-list">{job.blockers.map((item) => <li key={item}>{item}</li>)}</ul></> : null}
          <div className="tag-row">{isClosed ? <span className="tag tag--closed">已停止招聘</span> : null}{job.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
        </aside>
      </section>

      <section className="dossier-section" id="jd-editor">
        <div className="section-heading"><div><p className="eyebrow">JD snapshot</p><h2>职位描述</h2></div><span className="quality-chip" data-quality={job.jdQuality}>{job.jdQuality === "full" ? "完整" : job.jdQuality === "summary" ? "摘要" : "缺失"}</span></div>
        {job.jdText ? <details className="jd-disclosure"><summary>展开 JD 快照</summary><div className="jd-scroll"><p>{job.jdText}</p></div></details> : <p className="muted-copy">当前没有 JD 内容。</p>}
        <JdUpdateForm jobId={job.id} />
      </section>

      <section className="dossier-section">
        <div className="section-heading"><div><p className="eyebrow">Mail timeline</p><h2>求职邮件</h2></div><span>{messages.length}</span></div>
        {messages.length ? <div className="mail-timeline">{messages.map((message) => <details className="mail-message" key={message.id}>
          <summary><span className="mail-message__icon"><Mail size={16} /></span><span><strong>{message.subject}</strong><small>{message.senderName ?? message.senderEmail} · {formatDate(message.receivedAt)}</small></span><span className="mail-type">{message.classification}</span></summary>
          <div className="mail-message__body"><p>{message.bodyText}</p><a className="text-link" href={message.gmailUrl} target="_blank" rel="noreferrer">在 Gmail 打开 <ExternalLink size={13} /></a></div>
        </details>)}</div> : <p className="muted-copy">还没有与这个职位关联的邮件。</p>}
      </section>

      <section className="dossier-section">
        <div className="section-heading"><div><p className="eyebrow">Submitted materials</p><h2>申请材料</h2></div><Link className="text-link" href="/materials">查看版本库 →</Link></div>
        <p className="muted-copy">当前保存了 {materialCount} 组材料；每次修改都会创建新版本，不覆盖历史文件。</p>
      </section>

      <section className="dossier-section">
        <div className="section-heading"><div><p className="eyebrow">Preparation pack</p><h2>面试 / 作业准备</h2></div>{application ? <PreparationButton applicationId={application.id} /> : null}</div>
        {latestPack ? <article className="preparation-pack"><header><StatusBadge status={latestPack.status} /><span>v{latestPack.version} · {formatDate(latestPack.createdAt)}</span></header><h3>{latestPack.content.summary}</h3><PackList title="物流与时间" items={latestPack.content.logistics} /><PackList title="潜在考察" items={latestPack.content.assessmentAreas} />{latestPack.content.starStories.length ? <div><h4>STAR 素材</h4><div className="story-grid">{latestPack.content.starStories.map((story) => <article key={`${story.title}-${story.factIds.join("-")}`}><strong>{story.title}</strong><p>{story.outline}</p><small>{story.factIds.join(" · ")}</small></article>)}</div></div> : null}<PackList title="可能问题" items={latestPack.content.likelyQuestions} /><PackList title="反问问题" items={latestPack.content.questionsToAsk} /><PackList title="行动清单" items={latestPack.content.checklist} /></article> : <p className="muted-copy">进入面试、作业或 Offer 后会自动生成；也可以手动创建事实素材框架。</p>}
      </section>
    </>
  );
}

function stageLabel(stage: string) {
  return ({ needs_match: "待匹配", applied: "已投递", interview: "面试", task: "作业", offer: "Offer", rejected: "已拒绝", archived: "归档" } as Record<string, string>)[stage] ?? stage;
}

function messageTypeLabel(type: string) {
  return ({ acknowledgement: "投递确认", interview: "面试", task: "作业", offer: "Offer", rejection: "拒信", next_step: "下一步", other: "非申请邮件" } as Record<string, string>)[type] ?? type;
}

function processKindLabel(kind: string, roundNumber?: number | null) {
  if (kind === "screening") return roundNumber ? `第 ${roundNumber} 轮 · 初筛` : "电话 / Recruiter 初筛";
  if (kind === "interview") return roundNumber ? `第 ${roundNumber} 轮面试` : "面试";
  if (kind === "final_interview") return "最终面试";
  return ({ applied: "已投递", task: "作业 / Case Study", offer: "Offer", rejection: "结果：未通过", status_change: "状态调整", other: "下一步" } as Record<string, string>)[kind] ?? kind;
}

function collapseProcessSteps(steps: ApplicationProcessStep[]) {
  const grouped = new Map<string, ApplicationProcessStep & { updateCount: number }>();
  for (const step of steps) {
    const scheduledMinute = step.scheduledAt ? step.scheduledAt.slice(0, 16) : "";
    const repeatedManualState = !step.messageId && ["status_change", "rejection", "offer"].includes(step.kind);
    const key = scheduledMinute
      ? `${step.kind}:${step.roundNumber ?? ""}:${scheduledMinute}`
      : repeatedManualState
        ? `${step.kind}:${step.title}:${step.occurredAt.slice(0, 10)}`
        : step.id;
    const existing = grouped.get(key);
    if (existing) existing.updateCount += 1;
    else grouped.set(key, { ...step, updateCount: 1 });
  }
  return [...grouped.values()].sort((left, right) => new Date(left.scheduledAt ?? left.occurredAt).getTime() - new Date(right.scheduledAt ?? right.occurredAt).getTime());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function PackList({ title, items }: { title: string; items: string[] }) {
  return items.length ? <div><h4>{title}</h4><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div> : null;
}
