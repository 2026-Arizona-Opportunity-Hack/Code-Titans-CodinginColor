import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { Footer } from "./Footer";

/** Page frame for screens shown before anyone is signed in (header, one narrow column). */
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b-2 border-brand bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <BrandMark />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-10">
        {children}
      </main>
      <Footer />
    </div>
  );
}
