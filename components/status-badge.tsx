import type { ApplicationStage, JobStatus, MaterialVersion } from "@/lib/types";

const labels: Record<JobStatus, string> = {
  new: "新职位",
  shortlisted: "已入选",
  materials_ready: "材料就绪",
  reviewed: "已审核",
  applied: "已投递",
  interview: "面试",
  task: "作业",
  offer: "Offer",
  rejected: "未通过",
  archived: "已归档",
};

const applicationLabels: Record<ApplicationStage, string> = {
  needs_match: "待匹配", applied: "已投递", interview: "面试", task: "作业", offer: "Offer", rejected: "未通过", archived: "已归档",
};

export function StatusBadge({ status }: { status: JobStatus | ApplicationStage | "needs_jd" | "draft" | "failed" }) {
  const label = status === "needs_jd" ? "待补 JD" : status === "draft" ? "草稿" : status === "failed" ? "失败" : applicationLabels[status as ApplicationStage] ?? labels[status as JobStatus] ?? status;
  return <span className="status" data-status={status}>{label}</span>;
}

export function MaterialStatus({ status }: { status: MaterialVersion["status"] }) {
  const materialLabels: Record<MaterialVersion["status"], string> = {
    draft: "草稿",
    reviewed: "已审核",
    approved: "已批准",
    compile_pending: "待编译",
    failed: "失败",
  };
  return <span className="status" data-status={status}>{materialLabels[status]}</span>;
}
