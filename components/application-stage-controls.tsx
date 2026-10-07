"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ApplicationStage } from "@/lib/types";

const labels: Record<ApplicationStage, string> = {
  needs_match: "待匹配",
  applied: "已投递",
  interview: "面试",
  task: "作业",
  offer: "Offer",
  rejected: "已拒绝",
  archived: "归档",
};

export function ApplicationStageControls({ id, stage, compact = false, allowCreateSelect = false }: { id: string; stage?: ApplicationStage | null; compact?: boolean; allowCreateSelect?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState<ApplicationStage | "">(stage ?? (allowCreateSelect ? "" : "applied"));
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  async function save(next: ApplicationStage) {
    const previous = value;
    setValue(next);
    setState("saving");
    const response = await fetch(`/api/applications/${id}/status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next }) });
    setState(response.ok ? "idle" : "error");
    if (response.ok) router.refresh();
    else setValue(previous);
  }
  if (!stage && compact && !allowCreateSelect) return <button className="button button--outline button--small" disabled={state === "saving"} onClick={() => save("applied")}>{state === "saving" ? "保存中…" : "标记已投递"}</button>;
  return (
    <label className="stage-control">
      <span className="sr-only">修改申请阶段</span>
      <select value={value} disabled={state === "saving"} onChange={(event) => save(event.target.value as ApplicationStage)}>
        {!stage && allowCreateSelect ? <option value="" disabled>设置状态…</option> : null}
        {Object.entries(labels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
      </select>
      {state === "error" ? <small>保存失败</small> : null}
    </label>
  );
}
