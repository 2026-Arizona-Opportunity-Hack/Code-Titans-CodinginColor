"use client";

import { useState } from "react";
import { requestHint } from "../../lib/api/studentModule";
import { playerMessage } from "../../lib/studentErrors";

/** "Need a hint?" for checks and worksheets (never tests). The reply is a nudge, not the answer. */
export function HintBox({ token, moduleId, activityId }: { token: string; moduleId: string; activityId: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<{ text: string; level: number; left: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const r = await requestHint(token, { moduleId, activityId, question: question.trim() });
      setHint({ text: r.hint, level: r.level, left: r.remainingToday });
    } catch (err) {
      setError(playerMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" className="btn btn-secondary mt-6" onClick={() => setOpen(true)}>Need a hint?</button>;
  }
  return (
    <section className="callout mt-6" aria-labelledby="hint-h">
      <h3 id="hint-h" className="text-base font-bold">Ask for a hint</h3>
      <label htmlFor="hint-q" className="mt-2 block font-bold">What are you stuck on?</label>
      <textarea id="hint-q" rows={2} maxLength={500} className="field mt-1" value={question} onChange={(e) => setQuestion(e.target.value)} />
      <button type="button" className="btn btn-primary mt-3" disabled={busy || !question.trim()} onClick={ask}>{busy ? "Thinking…" : hint ? "Ask again" : "Get a hint"}</button>
      <div aria-live="polite">
        {hint ? (
          <div className="mt-3">
            <p className="font-bold">Hint {hint.level} of 3</p>
            <p className="whitespace-pre-wrap">{hint.text}</p>
            <p className="mt-1 text-sm text-muted">{hint.left} {hint.left === 1 ? "hint" : "hints"} left today. Your teacher can see the hints you ask for.</p>
          </div>
        ) : null}
        {error ? <p role="alert" className="mt-3 font-bold text-danger">{error}</p> : null}
      </div>
    </section>
  );
}
