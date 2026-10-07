"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="standalone-state"><p className="eyebrow">System note</p><h1>页面暂时没有完成加载。</h1><p>记录没有被修改。你可以重新尝试。</p><button className="button button--primary" type="button" onClick={reset}>重新加载</button></main>;
}
