import Link from "next/link";

export default function NotFound() {
  return <main className="standalone-state"><p className="eyebrow">404</p><h1>这份记录不存在。</h1><p>它可能已被合并、归档，或链接有误。</p><Link className="button button--primary" href="/jobs">返回职位收件箱</Link></main>;
}
