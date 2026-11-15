"use client";

import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { Footer } from "./Footer";

/**
 * Page frame for students: a sticky header and one centered column. It is designed
 * phone-first (students use phones outside class) and has no sidebar. Students
 * have no accounts, so "Not you? Sign out" matters on shared computers.
 */
export function StudentShell({
  studentName,
  className,
  onSignOut,
  children,
}: {
  studentName: string;
  className?: string;
  onSignOut?: () => void;
  children: ReactNode;
}) {
  const initial = studentName.trim().charAt(0).toUpperCase();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="site-header">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
          <BrandMark />
          <div className="flex flex-wrap items-center gap-x-3 text-sm">
            {className ? <span className="text-muted">{className}</span> : null}
            <span className="inline-flex items-center gap-2 font-bold">
              <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-brand text-on-brand">
                {initial}
              </span>
              Hi {studentName}
            </span>
            {onSignOut ? (
              <button
                type="button"
                onClick={onSignOut}
                className="min-h-11 px-1 font-bold text-brand underline underline-offset-2 hover:text-brand-hover"
              >
                Not you? Sign out
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <main id="main" className="rise mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        {children}
      </main>
      <Footer />
    </div>
  );
}
