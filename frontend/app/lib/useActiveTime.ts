"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Counts the seconds a student actively spends on a step and reports them in batches:
 * every 30 seconds while the tab is visible, when the tab is hidden, and when the step
 * closes. The server credits at most 45 seconds per report, so a tab left open overnight
 * earns nothing (docs/architecture.md section 7.4). `flush` sends what is pending now.
 */
export function useActiveTime(send: (seconds: number) => Promise<unknown>, enabled: boolean) {
  const pending = useRef(0);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  const flush = useCallback(async () => {
    const seconds = Math.min(pending.current, 120);
    if (seconds < 1) return;
    pending.current = 0;
    try {
      await sendRef.current(seconds);
    } catch {
      // Time on task is best effort: a missed report must never interrupt the student.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      pending.current += 1;
      if (pending.current >= 30) void flush();
    }, 1000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
      void flush();
    };
  }, [enabled, flush]);

  return flush;
}
