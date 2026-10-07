"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function MaterialReviewButton({ materialVersionId }: { materialVersionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error" | "success">("idle");
  async function review() {
    setState("loading");
    try {
      const response = await fetch(`/api/materials/${materialVersionId}/review`, { method: "POST" });
      if (!response.ok) throw new Error("Review failed");
      setState("success");
      router.refresh();
    } catch {
      setState("error");
    }
  }
  return <div className="material-review-control">
    <button
      aria-describedby={state === "error" ? `review-error-${materialVersionId}` : undefined}
      className="button button--outline button--small"
      data-state={state}
      disabled={state === "loading" || state === "success"}
      onClick={review}
      type="button"
    >
      <Check aria-hidden="true" size={15} />
      {state === "loading" ? "保存中…" : state === "success" ? "已审核" : state === "error" ? "重试审核" : "标记已审核"}
    </button>
    {state === "error" ? <small id={`review-error-${materialVersionId}`} role="alert">审核未保存，请重试。</small> : null}
  </div>;
}
