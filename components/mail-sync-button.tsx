"use client";

import { MailSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function MailSyncButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  async function run() {
    setState("loading");
    const response = await fetch("/api/automation/mail-sync/run-now", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setState(response.ok ? "success" : "error");
    if (response.ok) router.refresh();
  }
  return <button className="button button--outline" type="button" onClick={run} disabled={state === "loading"}><MailSearch size={17} />{state === "loading" ? "启动中…" : state === "success" ? "邮件同步已启动" : state === "error" ? "重试邮件同步" : "同步求职邮件"}</button>;
}
