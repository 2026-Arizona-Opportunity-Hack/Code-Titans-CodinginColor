import Link from "next/link";

/** The one big next step on the student's home page, from the server's resume pointer. */
export function StartHereCard({
  title,
  detail,
  actionLabel,
  href,
}: {
  title: string;
  detail?: string;
  actionLabel: string;
  href: string;
}) {
  return (
    <section aria-labelledby="start-heading" className="rounded-xl border-l-8 border-accent bg-tint p-6">
      <p className="text-sm font-bold uppercase tracking-wide text-brand">Start here</p>
      <h2 id="start-heading" className="mt-1 text-2xl">
        {title}
      </h2>
      {detail ? <p className="mt-1 text-muted">{detail}</p> : null}
      <Link href={href} className="btn btn-primary mt-4">
        {actionLabel}
      </Link>
    </section>
  );
}
