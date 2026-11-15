"use client";

import { useState } from "react";
import { HintBox } from "./HintBox";
import { playerMessage } from "../../lib/studentErrors";
import { sendHeartbeat, submitActivity, type Activity, type Answer, type Question, type StepResult } from "../../lib/api/studentModule";
import { useActiveTime } from "../../lib/useActiveTime";
import { Icon } from "../common/Icon";
import { InlineCode } from "./InlineCode";

type Asking = Extract<Activity, { type: "check" | "exit" | "assessment" }>;
type Value = string | string[];

const newSubmissionId = () => crypto.randomUUID();
const hasAnswer = (v: Value | undefined) => (Array.isArray(v) ? v.length > 0 : (v ?? "").trim() !== "");

function QuestionField({ q, value, onChange, disabled }: { q: Question; value: Value | undefined; onChange: (v: Value) => void; disabled: boolean }) {
  return (
    <fieldset disabled={disabled} className="card">
      <legend className="px-1 text-lg font-bold">
        <InlineCode text={q.prompt} />
      </legend>
      {q.type === "mcq" || q.type === "multi" ? (
        <div className="mt-3 flex flex-col gap-2">
          {q.choices?.map((c) => {
            const multi = q.type === "multi";
            const selected = multi ? ((value as string[] | undefined) ?? []).includes(c.id) : value === c.id;
            return (
              <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border-2 border-transparent px-2 hover:bg-tint has-[:checked]:border-brand has-[:checked]:bg-tint">
                <input
                  type={multi ? "checkbox" : "radio"}
                  name={q.questionId}
                  value={c.id}
                  checked={selected}
                  onChange={() =>
                    onChange(multi ? (selected ? (value as string[]).filter((x) => x !== c.id) : [...((value as string[]) ?? []), c.id]) : c.id)
                  }
                  className="size-5 accent-brand"
                />
                <span>
                  <InlineCode text={c.text} />
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <input
          type={q.type === "numeric" ? "number" : "text"}
          aria-label={q.prompt}
          value={(value as string | undefined) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          className="field mt-3"
        />
      )}
    </fieldset>
  );
}

/** A check, exit question or test: answer, submit once per attempt, and see feedback where the lesson allows it. */
export function QuestionActivity({
  activity,
  moduleId,
  token,
  onDone,
}: {
  activity: Asking;
  moduleId: string;
  token: string;
  onDone: (result: StepResult) => void;
}) {
  const isTest = activity.type === "assessment";
  const [answers, setAnswers] = useState<Record<string, Value>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StepResult | null>(null);
  const [submissionId, setSubmissionId] = useState(newSubmissionId);

  const complete = activity.state === "complete" && !result;
  useActiveTime((seconds) => sendHeartbeat(token, moduleId, activity.activityId, seconds), !complete && !result);
  const allAnswered = activity.questions.every((q) => hasAnswer(answers[q.questionId]));

  async function submit() {
    setBusy(true);
    setError(null);
    setConfirming(false);
    const body: Answer[] = activity.questions.map((q) => ({
      questionId: q.questionId,
      value: q.type === "numeric" ? Number(answers[q.questionId]) : (answers[q.questionId] ?? null),
    }));
    try {
      setResult(await submitActivity(token, moduleId, activity.activityId, submissionId, body));
    } catch (err) {
      setError(playerMessage(err)); // same id on retry
    } finally {
      setBusy(false);
    }
  }

  if (complete) {
    return (
      <p role="status" className="badge">
        <Icon name="check" className="size-4" /> {isTest ? "You submitted this test" : "You finished this step"}
      </p>
    );
  }

  if (result) {
    const failed = result.passed === false;
    return (
      <div role="status">
        {result.scorePct !== undefined ? (
          <p className={`callout text-lg font-bold ${failed ? "callout-danger text-danger" : "text-brand"}`}>
            {failed ? `${result.scorePct}%. Not quite yet, have another go.` : `${result.scorePct}%. Nicely done!`}
          </p>
        ) : (
          <p className="callout text-lg font-bold text-brand">Your answers are saved.</p>
        )}
        {result.results ? (
          <ul className="mt-4 flex flex-col gap-3">
            {result.results.map((r, i) => (
              <li key={r.questionId} className="card">
                <p className="font-bold">
                  Question {i + 1}: {r.correct ? "Correct" : "Not correct"}
                </p>
                {r.explanation ? <p className="mt-1 text-muted">{r.explanation}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-6">
          {failed ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setResult(null);
                setAnswers({});
                setSubmissionId(newSubmissionId());
              }}
            >
              Try again
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => onDone(result)}>
              Continue
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {isTest ? (
        <p className="callout mb-5">
          <span className="font-bold text-brand">
            {activity.role === "pre" ? "This test shows what you already know." : "This test shows what you have learned."}
          </span>{" "}
          It isn&apos;t a grade against you. You can only submit it once, and the answers aren&apos;t shown afterwards.
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {activity.questions.map((q) => (
          <QuestionField
            key={q.questionId}
            q={q}
            value={answers[q.questionId]}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.questionId]: v }))}
            disabled={busy || confirming}
          />
        ))}
      </div>

      {error ? (
        <p role="alert" className="callout callout-danger mt-4 font-bold text-danger">
          {error}
        </p>
      ) : null}

      {confirming ? (
        <div role="alert" className="callout mt-5">
          <p className="font-bold text-brand">Submit your test?</p>
          <p className="mt-1 text-sm text-muted">You can&apos;t change your answers after this.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
              Yes, submit
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
              Keep working
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!allAnswered || busy}
            aria-describedby={allAnswered ? undefined : "answer-all"}
            onClick={isTest ? () => setConfirming(true) : submit}
          >
            {busy ? "Saving…" : activity.type === "check" ? "Check my answers" : isTest ? "Submit test" : "Submit"}
          </button>
          {!allAnswered ? (
            <p id="answer-all" className="mt-2 text-sm text-muted">
              Answer every question to continue.
            </p>
          ) : null}
        </div>
      )}
      {activity.type === "check" ? <HintBox token={token} moduleId={moduleId} activityId={activity.activityId} /> : null}
    </div>
  );
}
