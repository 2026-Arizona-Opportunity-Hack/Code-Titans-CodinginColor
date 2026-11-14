"use client";

import { useEffect, useState } from "react";
import { env } from "../../config/env";

type State = "checking" | "ok" | "down";

/** Small smoke test: calls GET /health so we can see the API (or the mock) is reachable. */
export function ApiStatus() {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let cancelled = false;
    fetch(`${env.apiUrl}/health`)
      .then((res) => (res.ok ? "ok" : "down"))
      .catch(() => "down")
      .then((result) => {
        if (!cancelled) setState(result as State);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const label =
    state === "checking"
      ? "Checking the API…"
      : state === "ok"
        ? env.useMocks
          ? "API reachable (using fake data)"
          : "API reachable"
        : "API not reachable";

  return (
    <p role="status" className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={
          state === "ok"
            ? "inline-block size-3 rounded-full bg-success"
            : state === "down"
              ? "inline-block size-3 rounded-full bg-danger"
              : "inline-block size-3 rounded-full bg-muted"
        }
      />
      <span>{label}</span>
    </p>
  );
}
