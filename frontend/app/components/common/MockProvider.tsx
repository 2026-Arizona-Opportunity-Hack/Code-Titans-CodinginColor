"use client";

import { useEffect, useState, type ReactNode } from "react";
import { env } from "../../config/env";

// The worker must start exactly once per page load. React Strict Mode runs
// effects twice in development, so the start is cached in a module-level promise.
let workerStarted: Promise<void> | null = null;

function startWorker(): Promise<void> {
  if (!workerStarted) {
    workerStarted = import("../../mocks/browser").then(({ worker }) =>
      worker.start({ onUnhandledRequest: "bypass", quiet: true }).then(() => undefined),
    );
  }
  return workerStarted;
}

/**
 * Starts the Mock Service Worker before the app renders when
 * NEXT_PUBLIC_USE_MOCKS=true, so every screen can be built and demoed
 * without the backend. With mocks off it renders children immediately.
 */
export function MockProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!env.useMocks);

  useEffect(() => {
    if (!env.useMocks) return;
    let cancelled = false;
    startWorker()
      .catch((error) => console.error("Could not start the mock API", error))
      .then(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <p role="status" className="p-6 text-muted">
        Loading…
      </p>
    );
  }
  return <>{children}</>;
}
