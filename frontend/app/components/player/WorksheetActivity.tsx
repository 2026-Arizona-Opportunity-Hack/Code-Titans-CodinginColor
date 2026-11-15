"use client";

import { useEffect, useRef, useState } from "react";
import { playerMessage } from "../../lib/studentErrors";
import { saveDraft, sendHeartbeat, submitActivity, type Activity, type Answer, type StepResult } from "../../lib/api/studentModule";
import { useActiveTime } from "../../lib/useActiveTime";
import { Icon } from "../common/Icon";
import { HintBox } from "./HintBox";
import { InlineCode } from "./InlineCode";
import { Markdown } from "./Markdown";
import { DocumentViewer } from "../common/DocumentViewer";

type Sheet = Extract<Activity, { type: "worksheet" }>;
type SaveState = "idle" | "saving" | "saved" | "error";

const SAVE_DELAY_MS = 1500;
const toAnswers = (values: Record<string, string>, sheet: Sheet): Answer[] =>
  sheet.fields.map((f) => ({ questionId: f.fieldId, value: f.type === "numeric" && values[f.fieldId] !== "" ? Number(values[f.fieldId]) : values[f.fieldId] }));

/** A worksheet: answers save as the student types, so a closed lid or dropped connection loses nothing. */
export function WorksheetActivity({
  activity,
  moduleId,
  token,
  onDone,
}: {
  activity: Sheet;
  moduleId: string;
  token: string;
  onDone: (result: StepResult) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(activity.fields.map((f) => [f.fieldId, String(activity.draft?.[f.fieldId] ?? "")])),
  );
  const [save, setSave] = useState<SaveState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StepResult | null>(null);
  const [submissionId] = useState(() => crypto.randomUUID());

  const latest = useRef(values);
  const timer = useRef<number | undefined>(undefined);
  const unsaved = useRef(false);
  const finished = activity.state === "complete" && !result;

  useActiveTime((seconds) => sendHeartbeat(token, moduleId, activity.activityId, seconds), !finished && !result);

  async function persist() {
    unsaved.current = false;
    setSave("saving");
    try {
      await saveDraft(token, moduleId, activity.activityId, toAnswers(latest.current, activity));
      setSave("saved");
    } catch {
      unsaved.current = true;
      setSave("error");
    }
  }

  function change(fieldId: string, value: string) {
    latest.current = { ...latest.current, [fieldId]: value };
    setValues(latest.current);
    unsaved.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(persist, SAVE_DELAY_MS);
  }

  // Moving to another field saves straight away instead of waiting for the typing pause.
  function saveNow() {
    if (!unsaved.current) return;
    window.clearTimeout(timer.current);
    void persist();
  }

  // Leaving the step with unsaved typing: save it now.
  useEffect(() => {
    const draft = latest;
    const pending = unsaved;
    const waiting = timer;
    return () => {
      window.clearTimeout(waiting.current);
      if (pending.current) void saveDraft(token, moduleId, activity.activityId, toAnswers(draft.current, activity)).catch(() => {});
    };
  }, [token, moduleId, activity]);

  async function submit() {
    window.clearTimeout(timer.current);
    unsaved.current = false;
    setBusy(true);
    setError(null);
    try {
      setResult(await submitActivity(token, moduleId, activity.activityId, submissionId, toAnswers(values, activity)));
    } catch (err) {
      setError(playerMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (finished) {
    return (
      <p role="status" className="badge">
        <Icon name="check" className="size-4" /> You finished this step
      </p>
    );
  }

  if (result) {
    return (
      <div role="status">
        <p className="callout text-lg font-bold text-brand">Worksheet submitted.</p>
        {result.pendingReview ? <p className="mt-3 text-muted">Your teacher will read your written answers.</p> : null}
        {typeof result.autoScorePct === "number" ? <p className="mt-3 text-muted">Answers that can be checked automatically: {result.autoScorePct}%.</p> : null}
        <button type="button" className="btn btn-primary mt-6" onClick={() => onDone(result)}>
          Continue
        </button>
      </div>
    );
  }

  const complete = activity.fields.every((f) => values[f.fieldId].trim() !== "");
  return (
    <div>
      {activity.instructions ? <Markdown text={activity.instructions} className="mb-5 text-muted" /> : null}
      {activity.document ? (
        <div className="mb-6">
          <DocumentViewer doc={activity.document} title={`${activity.title}: worksheet`} />
        </div>
      ) : null}
      <div className="flex flex-col gap-4">
        {activity.fields.map((f) => (
          <div key={f.fieldId} className="card">
            <label htmlFor={f.fieldId} className="block text-lg font-bold">
              <InlineCode text={f.prompt} />
            </label>
            {f.type === "text" ? (
              <textarea id={f.fieldId} rows={4} value={values[f.fieldId]} onBlur={saveNow} onChange={(e) => change(f.fieldId, e.target.value)} className="field mt-3 font-mono" spellCheck={false} />
            ) : (
              <input
                id={f.fieldId}
                type={f.type === "numeric" ? "number" : "text"}
                value={values[f.fieldId]}
                onBlur={saveNow}
                onChange={(e) => change(f.fieldId, e.target.value)}
                autoComplete="off"
                className="field mt-3"
              />
            )}
          </div>
        ))}
      </div>

      <p aria-live="polite" className="mt-3 min-h-6 text-sm text-muted">
        {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Couldn't save yet. We'll keep trying as you type." : ""}
      </p>

      {error ? (
        <p role="alert" className="callout callout-danger mt-2 font-bold text-danger">
          {error}
        </p>
      ) : null}

      <button type="button" className="btn btn-primary mt-3" onClick={submit} disabled={!complete || busy} aria-describedby={complete ? undefined : "fill-all"}>
        {busy ? "Submitting…" : "Submit worksheet"}
      </button>
      {!complete ? (
        <p id="fill-all" className="mt-2 text-sm text-muted">
          Answer every question to submit.
        </p>
      ) : null}
      <HintBox token={token} moduleId={moduleId} activityId={activity.activityId} />
    </div>
  );
}
