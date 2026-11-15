import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type StatItem = { label: string; value: ReactNode; icon?: IconName; hint?: string };

/** A row of headline numbers. Each tile is a term and its value, so screen readers read "Students, 24". */
export function StatGrid({ items, className = "" }: { items: StatItem[]; className?: string }) {
  const cols = items.length >= 5 ? "sm:grid-cols-3 lg:grid-cols-5" : items.length === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <dl className={`grid grid-cols-2 gap-4 ${cols} ${className}`}>
      {items.map((s) => (
        <div key={s.label} className={`card grid gap-x-3 !p-4 ${s.icon ? "grid-cols-[auto_1fr]" : "grid-cols-1"}`}>
          {s.icon ? (
            <span className="icon-tile row-span-2 !size-10" aria-hidden="true">
              <Icon name={s.icon} className="size-5" />
            </span>
          ) : null}
          {/* The value is read after its label but shown above it. */}
          <dt className="stat-label row-start-2">{s.label}</dt>
          <dd className="stat-value row-start-1">{s.value}</dd>
          {s.hint ? <dd className={`row-start-3 text-xs text-muted ${s.icon ? "col-start-2" : ""}`}>{s.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
