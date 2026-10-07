"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function JdUpdateForm({ jobId, initialValue = "" }: { jobId: string; initialValue?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setState("saving");
    const response = await fetch(`/api/jobs/${jobId}/jd`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ jdText: value }) });
    const body = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) { setState("error"); setMessage(body.error ?? "保存失败"); return; }
    setState("success");
    setMessage("已保存，正在重新提取和评分。重载后可查看进度。");
    router.refresh();
  }
  return (
    <details className="jd-editor">
      <summary>粘贴或替换完整 JD</summary>
      <form onSubmit={submit}>
        <textarea minLength={250} required rows={14} value={value} onChange={(event) => setValue(event.target.value)} placeholder="粘贴完整职位描述；系统会保留旧版本并重新评分。" />
        <div className="jd-editor__actions"><span className="form-message" data-state={state === "error" ? "error" : undefined}>{message}</span><button className="button button--primary button--small" disabled={state === "saving"}>{state === "saving" ? "保存中…" : "保存并重新评分"}</button></div>
      </form>
    </details>
  );
}
