import Link from "next/link";
import { Icon } from "../common/Icon";

/** The one big next step on the student's home page, from the server's resume pointer. */
export function StartHereCard({
  title,
  label = "Start here",
  detail,
  actionLabel,
  href,
}: {
  title: string;
  /** The small badge above the title. */
  label?: string;
  detail?: string;
  actionLabel: string;
  href: string;
}) {
  return (
    <section
      aria-labelledby="start-heading"
      className="callout rise relative overflow-hidden bg-gradient-to-br from-tint to-white p-6 shadow-[var(--shadow-sm)] sm:p-8"
    >
      <p className="badge bg-surface">{label}</p>
      <h2 id="start-heading" className="mt-3 text-3xl">
        {title}
      </h2>
      {detail ? <p className="mt-2 text-lg text-muted">{detail}</p> : null}
      <Link href={href} className="btn btn-primary mt-6 px-7">
        <Icon name="play" />
        {actionLabel}
      </Link>
    </section>
  );
}
