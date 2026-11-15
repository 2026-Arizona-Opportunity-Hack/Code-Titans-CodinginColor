"use client";

import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { Footer } from "./Footer";
import { Icon } from "./Icon";

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
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
          <BrandMark />
          <div className="flex items-center gap-2 text-sm">
            {className ? <span className="hidden text-muted sm:inline">{className}</span> : null}
            <span className="inline-flex items-center gap-2 font-bold">
              <span aria-hidden="true" className="avatar !size-9">
                {initial}
              </span>
              <span>
                <span className="hidden sm:inline">Hi </span>
                {studentName}
              </span>
            </span>
            {onSignOut ? (
              <button type="button" onClick={onSignOut} className="btn btn-ghost btn-sm">
                <Icon name="logout" className="size-4" />
                <span>
                  Not you?<span className="hidden sm:inline"> Sign out</span>
                  <span className="sr-only sm:hidden"> Sign out</span>
                </span>
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
