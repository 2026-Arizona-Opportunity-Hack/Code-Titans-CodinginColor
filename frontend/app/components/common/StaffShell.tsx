"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { Footer } from "./Footer";

export type NavItem = {
  label: string;
  href: string;
  /** false renders a disabled "Soon" item for screens not built yet. */
  ready?: boolean;
};

/**
 * Page frame for instructors, authors, admins and reviewers: header, a left
 * navigation (a Menu button on small screens) and the page content. Each role
 * passes its own `items`, so the same frame serves every staff role.
 */
export function StaffShell({
  items,
  userName,
  roleLabel,
  onSignOut,
  children,
}: {
  items: NavItem[];
  userName: string;
  roleLabel: string;
  onSignOut?: () => void;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navId = useId();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="site-header">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn btn-secondary lg:hidden"
              aria-expanded={open}
              aria-controls={navId}
              onClick={() => setOpen((v) => !v)}
            >
              Menu
            </button>
            <BrandMark />
          </div>
          <p className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm">
            <span className="font-bold">{userName}</span>
            <span className="badge">{roleLabel}</span>
            {onSignOut ? (
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-11 px-1 font-bold text-brand underline underline-offset-2 hover:text-brand-hover"
              >
                Sign out
              </button>
            ) : null}
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row">
        <aside className="border-b border-line lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <nav id={navId} aria-label="Main" className={`${open ? "block" : "hidden"} lg:sticky lg:top-24 lg:block`}>
            <ul className="flex flex-col gap-1 p-3">
              {items.map((item) =>
                item.ready ? (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      aria-current={pathname.startsWith(item.href) ? "page" : undefined}
                      className="nav-link"
                    >
                      {item.label}
                    </Link>
                  </li>
                ) : (
                  <li key={item.label}>
                    <span aria-disabled="true" className="nav-link cursor-default text-muted hover:bg-transparent">
                      {item.label}
                      <span className="badge badge-muted">Soon</span>
                    </span>
                  </li>
                ),
              )}
            </ul>
          </nav>
        </aside>

        <main id="main" className="rise min-w-0 flex-1 px-4 py-8 lg:px-10">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
      <Footer />
    </div>
  );
}
