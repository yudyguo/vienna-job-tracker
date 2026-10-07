"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function JobScoringRefresh({ activeCount }: { activeCount: number }) {
  const router = useRouter();

  useEffect(() => {
    if (activeCount === 0) return;
    const timer = window.setInterval(() => router.refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [activeCount, router]);

  return <span className="sr-only" aria-live="polite">{activeCount ? `${activeCount} 个职位正在评分` : "职位评分已更新"}</span>;
}
