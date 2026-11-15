import Link from "next/link";
import type { Attention, StuckReason } from "../../lib/api/reports";
import { Icon } from "../common/Icon";
import { studentHref } from "./ProgressTable";

// Plain-language versions of the server's reasons (docs/api.md section 5).
const REASON: Record<StuckReason, string> = {
  repeated_attempts: "Several failed attempts",
  asked_for_hints: "Asked for a lot of hints",
  taking_longer_than_expected: "Taking much longer than expected",
  inactive: "No activity for several school days",
};

/** Who needs a teacher's help right now: students who are stuck, and students who have not started. */
export function AttentionPanel({ attention, titleOf, classId }: { attention: Attention; titleOf: (moduleId: string) => string; classId: string }) {
  const { stuck, notStarted } = attention;

  if (stuck.length === 0 && notStarted.length === 0) {
    return (
      <p role="status" className="callout mt-6 flex items-center gap-3 font-bold text-brand">
        <Icon name="check" className="size-5" />
        Nobody needs attention right now.
      </p>
    );
  }

  return (
    <section aria-labelledby="attention-heading" className="mt-6">
      <h2 id="attention-heading">Needs attention</h2>
      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="flex items-center gap-2">
            <Icon name="alert" className="size-5 text-warning" />
            Stuck <span className="badge badge-warn">{stuck.length}</span>
          </h3>
          {stuck.length === 0 ? <p className="mt-2 text-muted">Nobody is stuck.</p> : null}
          <ul className="mt-3 flex flex-col divide-y divide-hairline">
            {stuck.map((s) => (
              <li key={s.studentId} className="py-3 first:pt-0 last:pb-0">
                <p className="font-bold">
                  <Link href={studentHref(classId, s.studentId)}>{s.displayName}</Link>{" "}
                  <span className="font-normal text-muted">#{s.rosterNumber}</span>
                  <span className="font-normal text-muted"> · {titleOf(s.moduleId)}</span>
                </p>
                <p className="mt-1 flex flex-wrap gap-2">
                  {s.reasons.map((r) => (
                    <span key={r} className="badge badge-warn">
                      {REASON[r]}
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3 className="flex items-center gap-2">
            <Icon name="calendar" className="size-5 text-muted" />
            Not started <span className="badge badge-muted">{notStarted.length}</span>
          </h3>
          {notStarted.length === 0 ? <p className="mt-2 text-muted">Everyone has started.</p> : null}
          <ul className="mt-3 flex flex-col divide-y divide-hairline">
            {notStarted.map((s) => (
              <li key={s.studentId} className="py-3 first:pt-0 last:pb-0">
                <p className="font-bold">
                  <Link href={studentHref(classId, s.studentId)}>{s.displayName}</Link>{" "}
                  <span className="font-normal text-muted">#{s.rosterNumber}</span>
                </p>
                <p className="text-sm text-muted">
                  Next: {titleOf(s.moduleId)}
                  {s.waitingDays ? ` · waiting ${s.waitingDays} ${s.waitingDays === 1 ? "day" : "days"}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">
        A student shows as stuck after repeated failed attempts, lots of hint requests, taking much longer than expected, or several school
        days of no activity. These limits are set for each class.
      </p>
    </section>
  );
}
