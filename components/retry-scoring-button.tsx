"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RetryScoringButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function retry() {
    setLoading(true);
    try {
      await fetch(`/api/jobs/${jobId}/rescore`, { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return <button className="scoring-retry" type="button" onClick={retry} disabled={loading}>{loading ? "启动中" : "重试"}</button>;
}
