"use client";

import { useCallback, useEffect, useRef } from "react";

const IDLE_AFTER_MS = 60_000;

/**
 * Counts the seconds a student actively spends on a step and reports them in batches:
 * every 30 seconds while the tab is visible, when the tab is hidden, and when the step
 * closes. Time only counts while the student is doing something (typing, tapping, scrolling)
 * or, for video, while `countsWithoutInput` is set. The server credits at most 45 seconds per
 * report, so a tab left open overnight earns nothing (docs/architecture.md section 7.4).
 * `flush` sends what is pending now.
 */
export function useActiveTime(send: (seconds: number) => Promise<unknown>, enabled: boolean, countsWithoutInput = false, onSecond?: () => void) {
  const onSecondRef = useRef(onSecond);
  useEffect(() => {
    onSecondRef.current = onSecond;
  });
  const pending = useRef(0);
  const lastInput = useRef(0); // set when counting starts
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });

  const flush = useCallback(async () => {
    const seconds = Math.min(Math.floor(pending.current), 120);
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
    const seen = () => { lastInput.current = Date.now(); };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, seen, { passive: true }));
    lastInput.current = Date.now();
    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!countsWithoutInput && Date.now() - lastInput.current > IDLE_AFTER_MS) return; // walked away
      pending.current += 1;
      onSecondRef.current?.();
      if (pending.current >= 30) void flush();
    }, 1000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      events.forEach((e) => window.removeEventListener(e, seen));
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
      void flush();
    };
  }, [enabled, flush, countsWithoutInput]);

  return flush;
}
