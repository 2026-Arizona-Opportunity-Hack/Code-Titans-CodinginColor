import Link from "next/link";
import type { HomeModule, ModuleState } from "../../lib/api/student";

// Every state has an icon AND a text label, so meaning never depends on color alone.
const STATE: Record<ModuleState, { glyph: string; label: (pct: number) => string }> = {
  complete: { glyph: "✓", label: () => "Complete" },
  in_progress: { glyph: "●", label: (pct) => `In progress · ${pct}%` },
  available: { glyph: "○", label: () => "Ready to start" },
  locked: { glyph: "🔒", label: () => "Locked · finish the module before it first" },
  catch_up: { glyph: "↺", label: () => "Catch up · optional" },
};

export function moduleHref(moduleId: string) {
  return `/student/module/?id=${encodeURIComponent(moduleId)}`;
}

function ModuleCard({ module }: { module: HomeModule }) {
  const info = STATE[module.state];
  const open = module.state !== "locked";
  const showProgress = module.state === "in_progress" || module.state === "complete";

  return (
    <li
      className={`relative flex items-center gap-4 rounded-xl border border-line bg-surface p-4 ${
        open ? "hover:bg-tint" : ""
      }`}
    >
      <span aria-hidden="true" className="w-7 text-center text-xl font-bold text-brand">
        {info.glyph}
      </span>
      <div className="min-w-0 flex-1">
        {open ? (
          // The link covers the whole card (after:inset-0) so the tap target is large.
          <Link href={moduleHref(module.moduleId)} className="font-bold after:absolute after:inset-0">
            {module.title}
          </Link>
        ) : (
          <p className="font-bold">{module.title}</p>
        )}
        <p className="text-sm text-muted">{info.label(module.progressPct)}</p>
        {showProgress ? (
          <progress
            value={module.progressPct}
            max={100}
            aria-label={`${module.title} progress`}
            className="mt-2 h-2 w-full accent-accent"
          />
        ) : null}
      </div>
    </li>
  );
}

/** The student's path, with catch-up modules grouped apart because they never block progress. */
export function ModuleTrail({ modules }: { modules: HomeModule[] }) {
  const main = modules.filter((m) => m.state !== "catch_up");
  const catchUp = modules.filter((m) => m.state === "catch_up");

  return (
    <>
      {main.length > 0 ? (
        <section aria-labelledby="path-heading" className="mt-10">
          <h2 id="path-heading" className="mb-3 text-xl">
            Your path
          </h2>
          <ol className="flex flex-col gap-3">
            {main.map((m) => (
              <ModuleCard key={m.moduleId} module={m} />
            ))}
          </ol>
        </section>
      ) : null}

      {catchUp.length > 0 ? (
        <details className="mt-8 rounded-xl border border-line bg-surface p-4">
          <summary className="min-h-11 cursor-pointer py-2 font-bold text-brand">
            Catch up (optional) · {catchUp.length}
          </summary>
          <p className="mb-3 text-muted">Earlier modules you can open any time. Nothing waits on them.</p>
          <ol className="flex flex-col gap-3">
            {catchUp.map((m) => (
              <ModuleCard key={m.moduleId} module={m} />
            ))}
          </ol>
        </details>
      ) : null}
    </>
  );
}
