import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * The title block at the top of a screen: an optional "back" link, the page title, a short
 * line of explanation, and actions on the right. Using it everywhere keeps every screen
 * laid out the same way.
 */
export function PageHeader({
  title,
  description,
  back,
  actions,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** A link to the parent screen, shown above the title. */
  back?: { href: string; label: string };
  actions?: ReactNode;
  /** Small facts under the title, such as a class code or a student count. */
  meta?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="crumbs">
            <Icon name="arrowLeft" className="size-4" />
            {back.label}
          </Link>
        ) : null}
        <h1>{title}</h1>
        {description ? <p className="lede">{description}</p> : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
