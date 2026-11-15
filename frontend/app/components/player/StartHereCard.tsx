import Link from "next/link";
import { Icon } from "../common/Icon";

/** The one big next step on the student's home page, from the server's resume pointer. */
export function StartHereCard({
  title,
  label = "Start here",
  detail,
  percent,
  actionLabel,
  href,
}: {
  title: string;
  /** The small badge above the title. */
  label?: string;
  detail?: string;
  /** Shown as a progress bar when the student has already started this module. */
  percent?: number;
  actionLabel: string;
  href: string;
}) {
  return (
    <section
      aria-labelledby="start-heading"
      className="rise relative overflow-hidden rounded-[var(--radius-xl)] border border-tint bg-gradient-to-br from-tint via-wash to-white p-6 shadow-[var(--shadow-md)] sm:p-9"
    >
      {/* A soft ring of the brand accent, purely decorative. */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full border-[28px] border-accent/10" />
      <p className="badge badge-dot bg-surface">{label}</p>
      <h2 id="start-heading" className="mt-3 !text-[clamp(1.75rem,1.4rem+1.5vw,2.375rem)]">
        {title}
      </h2>
      {detail ? <p className="mt-1.5 text-lg text-muted">{detail}</p> : null}
      {percent !== undefined && percent > 0 ? (
        <progress value={percent} max={100} aria-label={`${title} progress`} className="meter mt-5 max-w-sm" />
      ) : null}
      <Link href={href} className="btn btn-primary mt-7 !min-h-12 px-7 text-base">
        <Icon name="play" />
        {actionLabel}
      </Link>
    </section>
  );
}
