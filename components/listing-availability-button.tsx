"use client";

import { Ban, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ListingStatus } from "@/lib/types";

export function ListingAvailabilityButton({
  jobId,
  status: initialStatus,
  compact = false,
  disabled = false,
  onStatusChange,
}: {
  jobId: string;
  status: ListingStatus;
  compact?: boolean;
  disabled?: boolean;
  onStatusChange?: (status: ListingStatus) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isClosed = status === "closed";
  const nextStatus = isClosed ? "active" : "closed";
  const label = isClosed ? "恢复为开放" : "标记已停止招聘";

  async function toggleAvailability() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/availability`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "无法更新招聘状态");
      setStatus(nextStatus);
      onStatusChange?.(nextStatus);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法更新招聘状态");
    } finally {
      setLoading(false);
    }
  }

  if (compact) {
    return (
      <span className="listing-toggle-wrap">
        <button
          className="icon-button listing-toggle--compact"
          type="button"
          onClick={toggleAvailability}
          disabled={disabled || loading}
          aria-label={label}
          title={label}
        >
          {isClosed ? <RotateCcw aria-hidden="true" size={16} /> : <Ban aria-hidden="true" size={16} />}
        </button>
        {error ? <span className="sr-only" role="alert">{error}</span> : null}
      </span>
    );
  }

  return (
    <div className="action-with-feedback" aria-live="polite">
      <button className="button button--outline" type="button" onClick={toggleAvailability} disabled={disabled || loading}>
        {isClosed ? <RotateCcw aria-hidden="true" size={17} /> : <Ban aria-hidden="true" size={17} />}
        {loading ? "保存中…" : label}
      </button>
      {error ? <span className="action-message" data-state="error">{error}</span> : null}
    </div>
  );
}
