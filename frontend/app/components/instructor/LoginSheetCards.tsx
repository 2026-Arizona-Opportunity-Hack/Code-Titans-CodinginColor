"use client";

import { useState } from "react";
import type { LoginSheet } from "../../lib/api/credentials";
import { linksCsv, studentLink } from "../../lib/loginLinks";

/**
 * One card per student with their secret words and personal link, to print or copy.
 * The words exist only in this component's memory: they are never stored in the browser,
 * logged, or kept in the data cache, because the server cannot show them again.
 */
export function LoginSheetCards({ sheet }: { sheet: LoginSheet }) {
  const [notice, setNotice] = useState("");
  const origin = window.location.origin;

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`Copied ${what}.`);
    } catch {
      setNotice("Copying is not available here. Select the text and copy it by hand.");
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([linksCsv(sheet, origin)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "login-links.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const allLinks = sheet.students.map((s) => `${s.displayName}: ${studentLink(sheet, s, origin)}`).join("\n");

  return (
    <>
      <div className="callout no-print">
        <p className="font-bold text-brand">These login words are shown only once.</p>
        <p className="mt-1 text-muted">
          Print them or copy the links now. If you lose one, create new words for that student.
        </p>
      </div>

      <div className="no-print mt-4 flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => copy(allLinks, "all links")}>
          Copy all links
        </button>
        <button type="button" className="btn btn-secondary" onClick={download}>
          Download links (CSV)
        </button>
      </div>
      <p className="no-print mt-2 text-sm text-muted">
        The CSV contains every student&apos;s secret link. Keep it private and send each link only to that student.
      </p>
      <p role="status" aria-live="polite" className="no-print mt-2 min-h-6 text-sm font-bold text-brand">
        {notice}
      </p>

      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {sheet.students.map((s) => {
          const link = studentLink(sheet, s, origin);
          return (
            <li key={s.studentId} className="card print-card">
              <p className="text-lg font-bold">
                {s.displayName} <span className="font-normal text-muted">#{s.rosterNumber}</span>
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <div>
                  <dt className="text-muted">Class code</dt>
                  <dd className="font-mono text-base font-bold">{sheet.classCode}</dd>
                </div>
                <div>
                  <dt className="text-muted">Secret words</dt>
                  <dd className="font-mono text-lg font-bold">{s.studentCode}</dd>
                </div>
                <div>
                  <dt className="text-muted">Link</dt>
                  <dd className="break-all font-mono">{link}</dd>
                </div>
              </dl>
              <button
                type="button"
                className="btn btn-secondary no-print mt-3"
                aria-label={`Copy link for ${s.displayName}`}
                onClick={() => copy(link, `the link for ${s.displayName}`)}
              >
                Copy link
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
