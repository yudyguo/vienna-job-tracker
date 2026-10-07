"use client";

import { Play } from "lucide-react";
import { useState } from "react";

export function RunNowButton() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  async function run() {
    setState("loading");
    setMessage("");
    try {
      const response = await fetch("/api/automation/run-now", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "运行未启动");
      setState("success");
      setMessage(`已进入队列 · ${body.runId}`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "运行未启动");
    }
  }
  return (
    <div className="action-with-feedback" aria-live="polite">
      <button className="button button--primary" type="button" onClick={run} disabled={state === "loading"} data-state={state}>
        <Play aria-hidden="true" size={17} />
        {state === "loading" ? "启动中…" : state === "success" ? "已启动" : "立即运行"}
      </button>
      {message ? <span className="action-message" data-state={state}>{message}</span> : null}
    </div>
  );
}
