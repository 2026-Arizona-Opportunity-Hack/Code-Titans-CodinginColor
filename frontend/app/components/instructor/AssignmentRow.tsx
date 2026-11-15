"use client";

import { useState } from "react";
import type { Assignment } from "../../lib/api/assignments";

/** One assigned module: position, version, progress and target date, with reorder, version change and remove. */
export function AssignmentRow({
  assignment,
  title,
  index,
  count,
  busy,
  latestVersion,
  onMove,
  onDate,
  onUpgrade,
  onRemove,
}: {
  assignment: Assignment;
  title: string;
  index: number;
  count: number;
  busy: boolean;
  latestVersion: number;
  onMove: (direction: -1 | 1) => void;
  onDate: (date: string | null) => void;
  onUpgrade: () => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [date, setDate] = useState(assignment.targetDate ?? "");
  const newer = latestVersion > assignment.moduleVersion;
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
          <button type="button" className="btn btn-secondary" disabled={busy || index === 0} aria-label={`Move ${title} up`} onClick={() => onMove(-1)}>
            Move up
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy || index === count - 1} aria-label={`Move ${title} down`} onClick={() => onMove(1)}>
            Move down
          </button>
          {!confirming ? (
            <button type="button" className="btn btn-secondary" aria-label={`Remove ${title}`} onClick={() => setConfirming(true)}>
              Remove
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`date-${assignment.moduleId}`} className="block text-sm font-bold">
            Target date <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id={`date-${assignment.moduleId}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field mt-1 w-auto" />
        </div>
        <button type="button" className="btn btn-secondary" disabled={busy || date === (assignment.targetDate ?? "") || date === ""} onClick={() => onDate(date)}>
          Save date
        </button>
        {assignment.targetDate ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            aria-label={`Clear the target date for ${title}`}
            onClick={() => {
              setDate("");
              onDate(null);
            }}
          >
            Clear date
          </button>
        ) : null}
      </div>

      {newer ? (
        <div className="callout mt-4">
          <p className="font-bold text-brand">A newer version of this module is available (version {latestVersion}).</p>
          <p className="mt-1 text-sm text-muted">Students keep the steps they finished; moving changes what they see from now on.</p>
          <button type="button" className="btn btn-primary mt-3" disabled={busy} onClick={onUpgrade}>
            Move to version {latestVersion}
          </button>
        </div>
      ) : null}

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
