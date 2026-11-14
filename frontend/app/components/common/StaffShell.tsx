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
  children,
}: {
  items: NavItem[];
  userName: string;
  roleLabel: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navId = useId();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b-2 border-brand bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
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
          <p className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <span className="font-bold">{userName}</span>
            <span className="rounded-full bg-tint px-2.5 py-0.5 font-bold text-brand">{roleLabel}</span>
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row">
        <aside className="border-b border-line lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <nav id={navId} aria-label="Main" className={`${open ? "block" : "hidden"} lg:block`}>
            <ul className="flex flex-col gap-1 p-3">
              {items.map((item) => {
                if (!item.ready) {
                  return (
                    <li key={item.label}>
                      <span
                        aria-disabled="true"
                        className="flex min-h-11 items-center justify-between rounded-lg px-3 py-2 text-muted"
                      >
                        {item.label}
                        <span className="rounded bg-tint px-2 text-xs font-bold text-brand">Soon</span>
                      </span>
                    </li>
                  );
                }
                const active = pathname.startsWith(item.href);
                return (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-11 items-center rounded-lg border-l-4 px-3 py-2 no-underline ${
                        active
                          ? "border-accent bg-tint font-bold text-brand"
                          : "border-transparent text-ink hover:bg-tint"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <main id="main" className="min-w-0 flex-1 px-4 py-8 lg:px-8">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
