import { PageHeader } from "@/components/page-header";
import { RunNowButton } from "@/components/run-now-button";
import { MailSyncButton } from "@/components/mail-sync-button";
import { DemoNotice } from "@/components/demo-notice";
import Link from "next/link";
import { getGmailConnectionHealth, listAutomationRuns, listMailSyncRuns } from "@/lib/repositories";

export default async function AutomationPage() {
  const [{ data: runs, demo }, mailRuns, gmailHealth] = await Promise.all([listAutomationRuns(), listMailSyncRuns(), getGmailConnectionHealth()]);
  return (
    <>
      <PageHeader title="自动化记录" description="职位每天 07:30 扫描；Inbox 元数据每 15 分钟扫描，只有疑似求职邮件才读取清洗后的正文。" action={<div className="job-header-actions"><MailSyncButton /><RunNowButton /></div>} />
      <DemoNotice show={demo} />
      {gmailHealth.status === "reauthorization_required" ? <aside className="notice notice--warning"><div><strong>Gmail 授权已过期，定时同步已暂停</strong><p>这不是邮件解析故障。请先在 Google Cloud 将 OAuth 应用发布到 Production，再到<Link className="text-link" href="/settings">设置页重新授权 Gmail</Link>。</p></div></aside> : null}
      <section className="section-block reveal" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="section-heading"><div><p className="eyebrow">Application mail</p><h2>邮件同步</h2></div><span>{mailRuns.length} 次</span></div>
        <div className="run-ledger">
          <div className="run-ledger__head"><span>时间 / 触发</span><span>扫描</span><span>候选</span><span>导入</span><span>待确认</span><span>状态</span></div>
          {mailRuns.map((run) => <article className="run-ledger__row" key={run.id}><div><strong>{new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(run.startedAt))}</strong><small>{run.trigger}</small></div><span data-label="扫描">{run.scanned}</span><span data-label="候选">{run.candidates}</span><span data-label="导入">{run.imported}</span><span data-label="待确认">{run.needsReview}</span><span className="run-state" data-state={run.status}>{run.status}</span>{run.error ? <p className="run-ledger__error">{run.error}</p> : null}</article>)}
          {!mailRuns.length ? <p className="muted-copy">尚未运行邮件同步。</p> : null}
        </div>
      </section>
      <section className="section-block reveal" style={{ "--i": 3 } as React.CSSProperties}>
        <div className="section-heading"><div><p className="eyebrow">Job discovery</p><h2>职位扫描</h2></div></div>
        <div className="run-ledger">
          <div className="run-ledger__head"><span>日期 / 触发</span><span>发现</span><span>去重</span><span>高分</span><span>材料</span><span>状态</span></div>
          {runs.map((run) => <article className="run-ledger__row" key={run.id}><div><strong>{run.localDate}</strong><small>{run.trigger === "manual" ? "手动" : "定时"}</small></div><span data-label="发现">{run.discovered}</span><span data-label="去重">{run.deduplicated}</span><span data-label="高分">{run.highScore}</span><span data-label="材料">{run.generated}</span><span className="run-state" data-state={run.status}>{run.status}</span></article>)}
        </div>
      </section>
      <aside className="method-note"><p className="eyebrow">Schedule method</p><p>Supabase Cron 每 15 分钟调用邮件同步入口；职位入口仍在每小时第 30 分钟检查 Vienna 07:30。两者都使用 Vault 中的共享密钥，Workflow step 可重试且 Gmail ID 唯一去重。</p></aside>
    </>
  );
}
