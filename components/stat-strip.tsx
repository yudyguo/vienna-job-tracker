export function StatStrip({
  stats,
}: {
  stats: Array<{ value: string | number; label: string; detail?: string }>;
}) {
  return (
    <section className="stat-strip reveal" aria-label="今日统计" style={{ "--i": 1 } as React.CSSProperties}>
      {stats.map((stat) => (
        <div className="stat-strip__item" key={stat.label}>
          <strong>{stat.value}</strong>
          <span>{stat.label}</span>
          {stat.detail ? <small>{stat.detail}</small> : null}
        </div>
      ))}
    </section>
  );
}
