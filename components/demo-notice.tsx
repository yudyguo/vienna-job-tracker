import { Info } from "lucide-react";

export function DemoNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <aside className="notice" role="note">
      <Info aria-hidden="true" size={18} />
      <div>
        <strong>当前显示演示数据</strong>
        <p>连接 Vercel 环境变量后，页面会切换到独立的 Supabase 数据库；演示职位不会写入生产数据。</p>
      </div>
    </aside>
  );
}
