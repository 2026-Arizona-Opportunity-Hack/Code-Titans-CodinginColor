"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { Footer } from "./Footer";
import { Icon, type IconName } from "./Icon";

export type NavItem = {
  label: string;
  href: string;
  /** false renders a disabled "Soon" item for screens not built yet. */
  ready?: boolean;
  icon?: IconName;
  /** Starts a new labeled group in the sidebar from this item on. */
  section?: string;
};

/** "Jordan Lee" becomes "JL". Used for the avatar only; the full name is always shown beside it. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Page frame for instructors, authors, admins and reviewers: a header with who is signed in,
 * a left navigation (a drawer on small screens) and the page content. Each role passes its
 * own `items`, so the same frame serves every staff role.
 */
export function StaffShell({
  items,
  userName,
  roleLabel,
  schoolName,
  onSignOut,
  children,
}: {
  items: NavItem[];
  userName: string;
  roleLabel: string;
  /** The person's school. Omitted for roles without one; null shows "No school assigned". */
  schoolName?: string | null;
  onSignOut?: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navId = useId();

  // The most specific matching item is the current page, so "Classes" (/instructor/) is not
  // also highlighted while "Curriculum" (/instructor/curriculum/) is open.
  const activeHref = items
    .filter((i) => i.ready && pathname.startsWith(i.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  // Items grouped under their section label ("Teach", "Administer"). Items before the first label form an unlabeled group.
  const groups: { section?: string; items: NavItem[] }[] = [];
  for (const item of items) {
    if (item.section || groups.length === 0) groups.push({ section: item.section, items: [] });
    groups[groups.length - 1].items.push(item);
  }

  // Close the drawer when Escape is pressed.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="site-header">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost -ml-2 px-2 lg:hidden"
              aria-expanded={open}
              aria-controls={navId}
              onClick={() => setOpen((v) => !v)}
            >
              <Icon name={open ? "close" : "menu"} className="size-6" />
              <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            </button>
            <BrandMark />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <span className="avatar" aria-hidden="true">
                {initials(userName)}
              </span>
              <p className="hidden flex-col leading-tight sm:flex">
                <span className="font-bold">{userName}</span>
                <span className="text-sm text-muted">
                  {roleLabel}
                  {schoolName !== undefined ? (
                    <>
                      {" · "}
                      <span className="sr-only">School: </span>
                      {schoolName ?? "No school assigned"}
                    </>
                  ) : null}
                </span>
              </p>
              {/* On a phone the name is hidden, so keep the role available to screen readers. */}
              <p className="sr-only sm:hidden">
                {userName}, {roleLabel}
              </p>
            </div>
            {onSignOut ? (
              <button type="button" onClick={onSignOut} className="btn btn-ghost btn-sm">
                <Icon name="logout" className="size-4" />
                <span className="hidden sm:inline">Sign out</span>
                <span className="sr-only sm:hidden">Sign out</span>
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row">
        <aside className="lg:w-64 lg:shrink-0 lg:border-r lg:border-hairline">
          <nav
            id={navId}
            aria-label="Main"
            className={`${open ? "block" : "hidden"} border-b border-hairline bg-surface lg:sticky lg:top-[4.25rem] lg:block lg:border-b-0`}
          >
            <ul className="flex flex-col px-3 pb-4 pt-2 lg:pl-4">
              {groups.map((group, g) => (
                <li key={group.section ?? `group-${g}`}>
                  {group.section ? (
                    <p id={`${navId}-g${g}`} className="nav-section">
                      {group.section}
                    </p>
                  ) : null}
                  <ul aria-labelledby={group.section ? `${navId}-g${g}` : undefined} className="flex flex-col gap-0.5">
                    {group.items.map((item) => (
                      <li key={item.label}>
                        {item.ready ? (
                          <Link
                            href={item.href}
                            aria-current={item.href === activeHref ? "page" : undefined}
                            onClick={() => setOpen(false)}
                            className="nav-link"
                          >
                            {item.icon ? <Icon name={item.icon} /> : null}
                            {item.label}
                          </Link>
                        ) : (
                          <span aria-disabled="true" className="nav-link cursor-default text-muted hover:bg-transparent">
                            {item.icon ? <Icon name={item.icon} /> : null}
                            {item.label}
                            <span className="badge badge-muted ml-auto">Soon</span>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <main id="main" className="rise min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
