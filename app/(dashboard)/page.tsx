import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3 } from "lucide-react";
import { ApplicationStageControls } from "@/components/application-stage-controls";
import { DemoNotice } from "@/components/demo-notice";
import { JobTable } from "@/components/job-table";
import { PageHeader } from "@/components/page-header";
import { StatStrip } from "@/components/stat-strip";
import { groupMaterialVersions } from "@/lib/materials/group-materials";
import { listApplications, listAutomationRuns, listJobs, listMaterials } from "@/lib/repositories";

export default async function DashboardPage() {
  const [jobsResult, materialsResult, applicationsResult, runsResult] = await Promise.all([
    listJobs(), listMaterials(), listApplications(), listAutomationRuns(),
  ]);
  const highScore = jobsResult.data.filter((job) => job.score >= 80 && job.blockers.length === 0);
  const draftCount = groupMaterialVersions(materialsResult.data)
    .filter((record) => record.variants.some((variant) => variant.status === "draft"))
    .length;
  const nextApplication = applicationsResult.data.find((item) => item.nextAction);
  const latestRun = runsResult.data[0];
  const activeApplications = applicationsResult.data
    .filter((item) => item.status !== "archived")
    .sort((left, right) => new Date(right.latestMessageAt ?? right.updatedAt).getTime() - new Date(left.latestMessageAt ?? left.updatedAt).getTime())
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="早上好，Yadi。"
        description="今天先处理最值得申请的职位；生成内容始终只是草稿，由你决定是否采用。"
        action={<Link className="button button--primary" href="/jobs">查看职位 <ArrowRight aria-hidden="true" size={17} /></Link>}
      />
      <DemoNotice show={jobsResult.demo} />
      <StatStrip stats={[
        { value: highScore.length, label: "高匹配职位", detail: "80 分及以上" },
        { value: draftCount, label: "待审核材料", detail: "不会自动投递" },
        { value: applicationsResult.data.length, label: "进行中申请", detail: "含面试与作业" },
        { value: latestRun?.status ?? "尚未运行", label: "最近自动化", detail: latestRun?.localDate ?? "等待连接" },
      ]} />

      <section className="section-block reveal" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="section-heading">
          <div><p className="eyebrow">Priority desk</p><h2>今日优先职位</h2></div>
          <Link className="text-link" href="/jobs">完整收件箱 →</Link>
        </div>
        <JobTable jobs={highScore.slice(0, 4)} compact editableStage />
      </section>

      <section className="section-block reveal" style={{ "--i": 3 } as React.CSSProperties}>
        <div className="section-heading">
          <div><p className="eyebrow">Application control</p><h2>直接调整申请状态</h2></div>
          <Link className="text-link" href="/applications">完整看板 →</Link>
        </div>
        {activeApplications.length ? <div className="dashboard-applications">
          {activeApplications.map((application) => <article key={application.logicalId ?? application.id}>
            <div><Link href={`/jobs/${application.jobId}`}>{application.title}</Link><span>{application.company}</span></div>
            <ApplicationStageControls id={application.id} stage={application.status} />
          </article>)}
        </div> : <p className="muted-copy">还没有进行中的申请。</p>}
      </section>

      <section className="two-column reveal" style={{ "--i": 4 } as React.CSSProperties}>
        <article className="ledger-card">
          <p className="eyebrow">Next action</p>
          <div className="ledger-card__icon"><Clock3 aria-hidden="true" size={20} /></div>
          <h2>{nextApplication?.nextAction ?? "暂无待办"}</h2>
          <p>{nextApplication ? `${nextApplication.company} · ${nextApplication.title}` : "有申请进入下一阶段后，提醒会出现在这里。"}</p>
          {nextApplication ? <Link className="text-link" href="/applications">打开申请时间线 →</Link> : null}
        </article>
        <article className="ledger-card ledger-card--accent">
          <p className="eyebrow">Guardrail</p>
          <div className="ledger-card__icon"><CheckCircle2 aria-hidden="true" size={20} /></div>
          <h2>事实引用已开启</h2>
          <p>每条生成陈述必须关联已验证的 CandidateFact；无法确认的数字不会进入正式材料。</p>
          <Link className="text-link" href="/settings">查看候选人事实 →</Link>
        </article>
      </section>
    </>
  );
}
