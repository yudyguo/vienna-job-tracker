"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  FileText,
  Gauge,
  Inbox,
  LogOut,
  Menu,
  Settings,
  Workflow,
  X,
} from "lucide-react";
import { useState } from "react";

const nav = [
  { href: "/", label: "今日概览", icon: Gauge },
  { href: "/jobs", label: "职位收件箱", icon: Inbox },
  { href: "/materials", label: "材料版本", icon: FileText },
  { href: "/applications", label: "申请进度", icon: BriefcaseBusiness },
  { href: "/automation", label: "自动化", icon: Workflow },
  { href: "/settings", label: "设置", icon: Settings },
];

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="主导航" className="rail__nav">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="rail__link"
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : "false"}
            onClick={onNavigate}
          >
            <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function logout() {
    setLoading(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <button className="rail__link rail__logout" type="button" onClick={logout} disabled={loading} data-state={loading ? "loading" : "default"}>
      <LogOut aria-hidden="true" size={18} strokeWidth={1.7} />
      <span>{loading ? "退出中…" : "退出"}</span>
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="rail" aria-label="Vienna Job Desk">
        <Link className="wordmark" href="/" aria-label="Vienna Job Desk 首页">
          <span className="wordmark__mark">YG</span>
          <span className="wordmark__copy">Vienna<br />Job Desk</span>
        </Link>
        <Navigation />
        <div className="rail__foot">
          <p>07:30 · Vienna</p>
          <LogoutButton />
        </div>
      </aside>

      <header className="mobile-bar">
        <Link className="mobile-bar__brand" href="/">Vienna Job Desk</Link>
        <button
          className="icon-button"
          type="button"
          aria-label={open ? "关闭导航" : "打开导航"}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}
        </button>
      </header>
      {open ? (
        <div className="mobile-sheet" id="mobile-navigation">
          <Navigation onNavigate={() => setOpen(false)} />
          <LogoutButton />
        </div>
      ) : null}

      <main id="main-content" className="workspace" tabIndex={-1}>
        {children}
        <footer className="foot-line">
          <p>Vienna Job Desk · Human review before every application · 2026</p>
        </footer>
      </main>
    </div>
  );
}
