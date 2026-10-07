"use client";

import { FilePlus2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateMaterialsButton({ jobId, disabled }: { jobId: string; disabled: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  async function generate() {
    setState("loading"); setMessage("");
    const response = await fetch(`/api/jobs/${jobId}/generate`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setState("error"); setMessage(body.error ?? "生成失败"); return; }
    setState("success"); setMessage("已生成草稿"); router.refresh();
  }
  return <div className="action-with-feedback" aria-live="polite"><button className="button button--primary" type="button" onClick={generate} disabled={disabled || state === "loading"}><FilePlus2 aria-hidden="true" size={17} />{state === "loading" ? "生成中…" : "生成申请材料"}</button>{message ? <span className="action-message" data-state={state}>{message}</span> : null}</div>;
}
