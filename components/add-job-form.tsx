"use client";

import { Plus, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

export function AddJobForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  function closeDialog() {
    if (state !== "loading") setOpen(false);
  }

  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setState("loading");
    setMessage("");
    const data = new FormData(form);
    const response = await fetch("/api/jobs", { method: "POST", body: data });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setState("error"); setMessage(body.error ?? "职位保存失败"); return; }
    setOpen(false);
    setState("idle");
    form.reset();
    router.refresh();
  }
  const dialog = open && typeof document !== "undefined"
    ? createPortal(
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <section ref={dialogRef} className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-job-title" onKeyDown={trapFocus}>
            <header>
              <div><p className="eyebrow">Manual intake</p><h2 id="add-job-title">添加职位</h2></div>
              <button className="icon-button" type="button" onClick={closeDialog} aria-label="关闭" disabled={state === "loading"}><X aria-hidden="true" size={20} /></button>
            </header>
            <form onSubmit={submit} className="stack-form" aria-busy={state === "loading"}>
              <div className="form-grid">
                <label>公司<input ref={firstFieldRef} name="company" required /></label>
                <label>职位名称<input name="title" required /></label>
                <label>地点<input name="location" defaultValue="Vienna, Austria" required /></label>
                <label>原始链接<input name="sourceUrl" type="url" placeholder="https://…" /></label>
              </div>
              <label>职位描述<textarea name="jdText" rows={9} required placeholder="粘贴完整 JD。系统会提取语言、技能、资历与硬性条件。" /></label>
              <p className="form-message" data-state={state} aria-live="polite">{message || "\u00a0"}</p>
              <footer>
                <button className="button button--quiet" type="button" onClick={closeDialog} disabled={state === "loading"}>取消</button>
                <button className="button button--primary" type="submit" disabled={state === "loading"}>{state === "loading" ? "保存中…" : "保存并评分"}</button>
              </footer>
            </form>
          </section>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button ref={triggerRef} className="button button--primary" type="button" onClick={() => setOpen(true)}><Plus aria-hidden="true" size={17} /> 添加职位</button>
      {dialog}
    </>
  );
}
