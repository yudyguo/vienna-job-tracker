"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PreparationButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  async function generate() {
    setState("loading");
    const response = await fetch(`/api/applications/${applicationId}/preparation`, { method: "POST" });
    setState(response.ok ? "idle" : "error");
    if (response.ok) router.refresh();
  }
  return <button className="button button--outline button--small" onClick={generate} disabled={state === "loading"}>{state === "loading" ? "生成中…" : state === "error" ? "重试准备包" : "生成新版准备包"}</button>;
}
