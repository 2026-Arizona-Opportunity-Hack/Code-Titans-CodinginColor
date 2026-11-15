"use client";

import { useState } from "react";
import type { Assignment } from "../../lib/api/assignments";

/** One assigned module: its position, version and progress, with remove. */
export function AssignmentRow({
  assignment,
  title,
  index,
  busy,
  onRemove,
}: {
  assignment: Assignment;
  title: string;
  index: number;
  busy: boolean;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const started = assignment.startedCount ?? 0;

  return (
    <li className="card">
      <div className="flex flex-wrap items-center gap-4">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-tint font-bold text-brand">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold">{title}</p>
          <p className="mt-1 flex flex-wrap gap-2">
            <span className="badge badge-muted">Version {assignment.moduleVersion}</span>
            <span className={started > 0 ? "badge" : "badge badge-muted"}>
              {started === 0 ? "Nobody started yet" : `${started} ${started === 1 ? "student" : "students"} started`}
            </span>
            {assignment.targetDate ? <span className="badge">Target {assignment.targetDate}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!confirming ? (
            <button type="button" className="btn btn-secondary" aria-label={`Remove ${title}`} onClick={() => setConfirming(true)}>
              Remove
            </button>
          ) : null}
        </div>
      </div>

      {confirming ? (
        <div role="alert" className="callout callout-danger mt-4">
          <p className="font-bold text-danger">Remove {title} from this class?</p>
          <p className="mt-1 text-sm text-muted">Students will no longer see it. Their saved progress is not deleted.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onRemove}>
              Yes, remove it
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
