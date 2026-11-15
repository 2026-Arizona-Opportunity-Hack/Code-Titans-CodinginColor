import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { Footer } from "./Footer";

/** Page frame for screens shown before anyone is signed in: header and one centered card. */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="site-header">
        <div className="mx-auto max-w-3xl px-4 py-2">
          <BrandMark />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:py-14">
        <div className="card rise p-6 sm:p-10">{children}</div>
      </main>
      <Footer />
    </div>
  );
}
