import Link from "next/link";
import type { HomeModule, ModuleState } from "../../lib/api/student";
import { Icon, type IconName } from "../common/Icon";

// Every state has an icon AND a text label, so meaning never depends on color alone.
const STATE: Record<ModuleState, { icon: IconName; circle: string; badge: string; label: (pct: number) => string }> = {
  complete: { icon: "check", circle: "bg-brand text-on-brand", badge: "badge", label: () => "Complete" },
  in_progress: { icon: "play", circle: "bg-tint text-brand", badge: "badge", label: (pct) => `In progress · ${pct}%` },
  available: { icon: "play", circle: "bg-tint text-brand", badge: "badge", label: () => "Ready to start" },
  locked: {
    icon: "lock",
    circle: "bg-line/30 text-muted",
    badge: "badge badge-muted",
    label: () => "Locked · finish the module before it first",
  },
  catch_up: { icon: "history", circle: "bg-tint text-brand", badge: "badge badge-warn", label: () => "Catch up · optional" },
};

export function moduleHref(moduleId: string) {
  return `/student/module/?id=${encodeURIComponent(moduleId)}`;
}

function ModuleCard({ module }: { module: HomeModule }) {
  const info = STATE[module.state];
  const open = module.state !== "locked";
  const showProgress = module.state === "in_progress" || module.state === "complete";

  return (
    <li className={`card relative flex items-center gap-4 ${open ? "card-interactive" : "bg-canvas shadow-none"}`}>
      <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-full ${info.circle}`}>
        <Icon name={info.icon} />
      </span>
      <div className="min-w-0 flex-1">
        {open ? (
          // The link covers the whole card (after:inset-0) so the tap target is large.
          <Link href={moduleHref(module.moduleId)} className="text-lg font-bold no-underline after:absolute after:inset-0">
            {module.title}
          </Link>
        ) : (
          <p className="text-lg font-bold text-muted">{module.title}</p>
        )}
        <p className="mt-1">
          <span className={info.badge}>{info.label(module.percent)}</span>
        </p>
        {showProgress ? (
          <progress value={module.percent} max={100} aria-label={`${module.title} progress`} className="meter mt-3" />
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
        <section aria-labelledby="path-heading" className="rise rise-2 mt-12">
          <h2 id="path-heading" className="mb-4">
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
        <details className="card rise rise-3 mt-8 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-bold text-brand">
            <span>Catch up (optional) · {catchUp.length}</span>
            <span aria-hidden="true" className="text-xl leading-none">+</span>
          </summary>
          <p className="mb-4 mt-2 text-muted">Earlier modules you can open any time. Nothing waits on them.</p>
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
