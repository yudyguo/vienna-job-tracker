"use client";

import { LockKeyhole } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");
    setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: data.get("password") }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "登录失败" }));
      setState("error");
      setMessage(body.error ?? "登录失败");
      return;
    }
    const next = search.get("next");
    router.replace(next?.startsWith("/") ? next : "/");
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={submit} aria-busy={state === "loading"}>
      <label htmlFor="password">管理员口令</label>
      <div className="password-field"><LockKeyhole aria-hidden="true" size={18} /><input id="password" name="password" type="password" autoComplete="current-password" required autoFocus aria-invalid={state === "error"} disabled={!configured || state === "loading"} /></div>
      <button className="button button--primary button--wide" type="submit" disabled={!configured || state === "loading"}>{state === "loading" ? "验证中…" : "进入工作台"}</button>
      <p className="form-message" data-state={!configured || state === "error" ? "error" : state} aria-live="polite">{!configured ? "生产环境尚未设置管理员哈希与会话密钥。" : message || "\u00a0"}</p>
    </form>
  );
}
