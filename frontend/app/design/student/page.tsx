"use client";

import { StudentShell } from "../../components/common/StudentShell";

// Static LAYOUT PREVIEW with sample content, not a working screen. The real
// student home is built in the next phase and replaces this page.
const path = [
  { title: "Variables", status: "Complete", glyph: "✓" },
  { title: "Python Loops", status: "In progress · 33%", glyph: "●" },
  { title: "Functions", status: "Locked · finish Python Loops first", glyph: "○" },
];

export default function StudentLayoutPreview() {
  return (
    <StudentShell studentName="Maya" className="Maryvale · Period 3" onSignOut={() => undefined}>
      <p className="mb-6 text-sm text-muted">Layout preview with sample content.</p>

      <h1 className="mb-6 text-3xl">Your learning path</h1>

      <section aria-labelledby="start-heading" className="rounded-xl border-l-8 border-accent bg-tint p-6">
        <p className="text-sm font-bold uppercase tracking-wide text-brand">Start here</p>
        <h2 id="start-heading" className="mt-1 text-2xl">
          Python Loops
        </h2>
        <p className="mt-1 text-muted">Step 1 of 6 · Pretest · about 5 minutes</p>
        <button type="button" className="btn btn-primary mt-4">
          Start
        </button>
      </section>

      <section aria-labelledby="path-heading" className="mt-10">
        <h2 id="path-heading" className="mb-3 text-xl">
          Your path
        </h2>
        <ol className="flex flex-col gap-3">
          {path.map((m) => (
            <li key={m.title} className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4">
              <span aria-hidden="true" className="w-6 text-center text-xl font-bold text-brand">
                {m.glyph}
              </span>
              <div className="flex-1">
                <p className="font-bold">{m.title}</p>
                <p className="text-sm text-muted">{m.status}</p>
              </div>
            </li>
          ))}
        </ol>

        <details className="mt-4 rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-bold text-brand">Catch up (optional)</summary>
          <p className="mt-2 text-muted">Earlier modules you can open any time. Nothing waits on them.</p>
        </details>
      </section>
    </StudentShell>
  );
}
