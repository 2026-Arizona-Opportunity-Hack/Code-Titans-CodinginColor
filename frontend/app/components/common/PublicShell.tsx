import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { Footer } from "./Footer";
import { Icon } from "./Icon";

/** Page frame for screens shown before anyone is signed in: header and one centered card. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="site-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
          <BrandMark />
          <Link href="/" className="btn btn-ghost btn-sm">
            <Icon name="arrowLeft" className="size-4" />
            Home
          </Link>
        </div>
      </header>
      <main id="main" className="flex-1 bg-gradient-to-b from-wash to-white">
        <div className="mx-auto w-full max-w-lg px-4 py-12 sm:py-16">
          <div className="card rise !p-7 shadow-[var(--shadow-lg)] sm:!p-10">{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
