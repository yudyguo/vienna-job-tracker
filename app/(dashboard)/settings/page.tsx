import { Check, CircleDashed, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { listCandidateFacts } from "@/lib/candidate-facts";
import { integrationStatus } from "@/lib/env";
import { getGmailConnectionHealth } from "@/lib/repositories";

export default async function SettingsPage() {
  const status = integrationStatus();
  const [candidateFacts, gmailHealth] = await Promise.all([listCandidateFacts(), getGmailConnectionHealth()]);
  const integrations = [
    ["Supabase", status.supabase, "Postgres 与私有文件"],
    ["DeepSeek", status.deepseek, "提取、评分与材料草稿"],
    ["Gmail", status.gmail, "只读指定标签与自发汇总"],
    ["Daily trigger", status.automation, "Vienna 07:30 幂等入口"],
  ] as const;
  return (
    <>
      <PageHeader title="设置与事实库" description="连接状态只显示是否配置；密钥值永远不会回传到页面。" />
      <section className="settings-grid reveal" style={{ "--i": 1 } as React.CSSProperties}>
        <div className="settings-panel"><p className="eyebrow">Connections</p><h2>服务连接</h2><div className="connection-list">{integrations.map(([name, connected, detail]) => {
          const needsGmailAuthorization = name === "Gmail" && gmailHealth.status === "reauthorization_required";
          const healthy = connected && !needsGmailAuthorization;
          return <div className="connection" key={name}>{healthy ? <Check aria-hidden="true" size={18} /> : <CircleDashed aria-hidden="true" size={18} />}<div><strong>{name}</strong><span>{name === "Gmail" && gmailHealth.accountEmail ? `${detail} · ${gmailHealth.accountEmail}` : detail}</span></div><small>{needsGmailAuthorization ? "需重新授权" : connected ? "已配置" : "待配置"}</small></div>;
        })}</div>{status.gmail ? <Link className="button button--outline connection-action" href="/api/gmail/connect">{gmailHealth.status === "reauthorization_required" ? "重新授权 Gmail" : gmailHealth.status === "active" ? "重新连接 Gmail" : "连接 Gmail"}</Link> : null}</div>
        <aside className="privacy-panel"><LockKeyhole aria-hidden="true" size={24} /><p className="eyebrow">Privacy mode</p><h2>完整材料模式</h2><p>DeepSeek 可接收完整简历文字与相关邮件正文；PDF 原文件、OAuth token、邮件内部 ID 与系统密钥永不发送。</p><span className="status" data-status="reviewed">人工审核开启</span></aside>
      </section>
      {gmailHealth.status === "reauthorization_required" ? <aside className="notice notice--warning"><CircleDashed aria-hidden="true" size={20} /><div><strong>Gmail 自动同步已暂停</strong><p>Google 授权已过期。先把 Google OAuth 应用发布到 Production，再点击上方“重新授权 Gmail”，即可恢复 15 分钟同步。</p></div></aside> : null}
      <section className="section-block reveal" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="section-heading"><div><p className="eyebrow">CandidateFacts</p><h2>已验证候选人事实</h2></div><span className="fact-count">{candidateFacts.length} 条</span></div>
        <div className="fact-grid">{candidateFacts.map((fact) => <article className="fact-card" key={fact.id}><p className="eyebrow">{fact.category} · {fact.id}</p><h3>{fact.label}</h3><strong>{fact.value}</strong><p>{fact.evidence}</p><span>来源：{fact.source}</span></article>)}</div>
      </section>
      <aside className="secret-instruction"><h2>安全配置 DeepSeek Key</h2><p>只在 Vercel Dashboard 的 Production 环境添加 <code>DEEPSEEK_API_KEY</code> 并标记 Sensitive。不要把 key 粘贴到聊天、代码、Supabase、Preview 或 Build 环境。</p></aside>
    </>
  );
}
