import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { env } from "@/lib/env";

export const metadata = { title: "管理员登录" };

export default function LoginPage() {
  const configured = Boolean(env.ADMIN_PASSWORD_HASH && env.SESSION_SIGNING_KEY);
  return (
    <main className="login-page">
      <section className="login-editorial">
        <div className="login-wordmark"><span>YG</span><p>Vienna<br />Job Desk</p></div>
        <div><p className="eyebrow">Private workbench · Vienna</p><h1>每一份申请，<br /><em>都有据可查。</em></h1><p className="login-intro">职位、评分、简历与 Cover Letter 的单人工作台。AI 只起草，你做最后决定。</p></div>
        <p className="login-note">07:30 daily · Europe/Vienna<br />No automatic applications</p>
      </section>
      <section className="login-panel">
        <div className="login-panel__inner"><p className="eyebrow">Administrator access</p><h2>欢迎回来</h2><p>会话将在 12 小时后失效。</p><Suspense fallback={<p>加载登录表单…</p>}><LoginForm configured={configured} /></Suspense><small>口令不会被发送到数据库或写入日志。</small></div>
      </section>
    </main>
  );
}
