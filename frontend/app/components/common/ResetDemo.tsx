"use client";

import { resetAll } from "../../mocks/persist";

/** Demo mode only (it sits on the front page): forgets the fake data and any signed-in session, then reloads. */
export function ResetDemo() {
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => {
        resetAll();
        try { window.sessionStorage.clear(); } catch { /* storage blocked */ }
        window.location.reload();
      }}
    >
      Reset demo data
    </button>
  );
}
