import Link from "next/link";
import { CalendarClock, Mail, TriangleAlert } from "lucide-react";
import { ApplicationBoardScroller } from "@/components/application-board-scroller";
import { ApplicationStageControls } from "@/components/application-stage-controls";
import { DemoNotice } from "@/components/demo-notice";
import { PageHeader } from "@/components/page-header";
import { listApplications } from "@/lib/repositories";
import type { Application, ApplicationStage } from "@/lib/types";

const columns: Array<{ stage: ApplicationStage; label: string }> = [
  { stage: "needs_match", label: "待匹配" },
  { stage: "applied", label: "已投递" },
  { stage: "interview", label: "面试" },
  { stage: "task", label: "作业" },
  { stage: "offer", label: "Offer" },
  { stage: "rejected", label: "已拒绝" },
];

function order(items: Application[]) {
  return items.sort((left, right) => {
    const leftDeadline = left.nextActionAt ? new Date(left.nextActionAt).getTime() : Number.MAX_SAFE_INTEGER;
    const rightDeadline = right.nextActionAt ? new Date(right.nextActionAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;
    return new Date(right.latestMessageAt ?? right.updatedAt).getTime() - new Date(left.latestMessageAt ?? left.updatedAt).getTime();
  });
}

export default async function ApplicationsPage() {
  const { data: applications, demo } = await listApplications();
  const visibleApplications = applications.filter((application) => application.status !== "archived");
  return (
    <>
      <PageHeader title="申请看板" description="求职邮件会自动归档；只有高置信度分类才会推进阶段，所有修改都有记录。" />
      <DemoNotice show={demo} />
      {visibleApplications.length ? <section className="application-board-shell reveal" style={{ "--i": 2 } as React.CSSProperties}>
        <ApplicationBoardScroller labels={columns.map((column) => column.label)}>
          <div className="application-board">
            {columns.map((column) => {
              const items = order(visibleApplications.filter((item) => item.status === column.stage));
              return <div className="application-column" key={column.stage} data-stage={column.stage}>
                <header><h2>{column.label}</h2><span>{items.length}</span></header>
                <div className="application-column__cards">
                  {items.map((item) => <article className="application-card" key={item.logicalId ?? item.id}>
                    <div className="application-card__top">{item.requiresReview ? <span className="review-flag"><TriangleAlert size={14} /> 待确认</span> : item.latestMessageType ? <span className="mail-type"><Mail size={14} /> {item.latestMessageType}</span> : null}<ApplicationStageControls id={item.id} stage={item.status} /></div>
                    <h3><Link href={`/jobs/${item.jobId}`}>{item.title}</Link></h3>
                    <p>{item.company}</p>
                    {item.nextAction ? <div className="application-next"><CalendarClock size={15} /><span>{item.nextAction}</span></div> : null}
                    <footer><span>JD {item.jdQuality === "full" ? "完整" : item.jdQuality === "summary" ? "仅摘要" : "缺失"}</span>{item.nextActionAt ? <time dateTime={item.nextActionAt}>{new Intl.DateTimeFormat("de-AT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.nextActionAt))}</time> : null}</footer>
                  </article>)}
                  {!items.length ? <p className="application-column__empty">暂无记录</p> : null}
                </div>
              </div>;
            })}
          </div>
        </ApplicationBoardScroller>
      </section> : <div className="empty-state"><div className="empty-state__mark">→</div><h2>还没有申请记录</h2><p>手动标记已投递，或运行邮件同步后，职位会出现在这里。</p></div>}
    </>
  );
}
