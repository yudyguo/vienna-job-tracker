import Link from "next/link";

export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="page-header reveal" style={{ "--i": 0 } as React.CSSProperties}>
      <div className="page-header__copy">
        {back ? <Link className="back-link" href={back.href}>← {back.label}</Link> : null}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="page-header__action">{action}</div> : null}
    </header>
  );
}
