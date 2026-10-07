import { AddJobForm } from "@/components/add-job-form";
import { DemoNotice } from "@/components/demo-notice";
import { JobTable } from "@/components/job-table";
import { PageHeader } from "@/components/page-header";
import { listJobs } from "@/lib/repositories";
import { JobScoringRefresh } from "@/components/job-scoring-refresh";

export const metadata = { title: "职位收件箱" };

export default async function JobsPage() {
  const { data: jobs, demo } = await listJobs();
  const attentionJobs = jobs.filter((job) => job.inboxKind !== "mail_low_signal");
  const hiddenMailCount = jobs.length - attentionJobs.length;
  const recommendationCount = jobs.filter((job) => job.inboxKind === "recommendation").length;
  const activeScoringCount = attentionJobs.filter((job) => job.scoringStatus === "queued" || job.scoringStatus === "scoring").length;
  return (
    <>
      <JobScoringRefresh activeCount={activeScoringCount} />
      <PageHeader title="职位收件箱" description="真实职位和重要流程邮件集中在这里；普通确认信与招聘广告会自动收起。" action={<AddJobForm />} />
      <DemoNotice show={demo} />
      <section className="filter-line" aria-label="职位汇总">
        <span><strong>{attentionJobs.length}</strong> 有效职位</span>
        <span><strong>{attentionJobs.filter((job) => job.score >= 80).length}</strong> 高匹配</span>
        <span><strong>{attentionJobs.filter((job) => job.blockers.length > 0).length}</strong> 有阻断项</span>
        <span><strong>{recommendationCount}</strong> 岗位推介</span>
        <span><strong>{hiddenMailCount}</strong> 已收起邮件</span>
      </section>
      <section className="section-block reveal" style={{ "--i": 2 } as React.CSSProperties}>
        <JobTable jobs={jobs} filters />
      </section>
    </>
  );
}
