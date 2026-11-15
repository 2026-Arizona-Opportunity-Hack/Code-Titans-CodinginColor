"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { saveCodeDraft, sendHeartbeat, submitCode, type CodeActivityData, type StepResult } from "../../lib/api/studentModule";
import { checkTests, problemOf, type TestOutcome } from "../../lib/pyodide/checkTests";
import { PythonLoadError, sharedRunner, type RunResult } from "../../lib/pyodide/runner";
import { playerMessage } from "../../lib/studentErrors";
import { useActiveTime } from "../../lib/useActiveTime";
import { Icon } from "../common/Icon";
import { HintBox } from "./HintBox";

const SAVE_DELAY_MS = 2000;
type Phase = "idle" | "loading" | "running" | "checking";

/**
 * A coding exercise. The student writes Python, runs it, and checks it against the author's tests, all
 * in the browser (Pyodide). Submitting sends the code and which tests passed. The server keeps the code
 * for the teacher and decides from the module's own test list whether the step is complete.
 */
export function CodeActivity({ activity, moduleId, token, onDone }: { activity: CodeActivityData; moduleId: string; token: string; onDone: (result: StepResult) => void }) {
  const starter = activity.starterCode ?? "";
  const [code, setCode] = useState(activity.draftCode ?? starter);
  const [stdin, setStdin] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState<RunResult | null>(null);
  const [outcomes, setOutcomes] = useState<TestOutcome[] | null>(null);
  const [checkedCode, setCheckedCode] = useState<string | null>(null); // the code the results belong to
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<StepResult | null>(null);
  const [tabMoves, setTabMoves] = useState(false); // Esc releases the Tab key so keyboard users can leave the box
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const latest = useRef(code);
  const timer = useRef<number | undefined>(undefined);
  const unsaved = useRef(false);
  const finished = activity.state === "complete";
  useActiveTime((seconds) => sendHeartbeat(token, moduleId, activity.activityId, seconds), !result);

  useEffect(() => {
    sharedRunner().warm(); // start loading Python while the student reads the task
  }, []);

  async function persist() {
    unsaved.current = false;
    setSaved("saving");
    try {
      await saveCodeDraft(token, moduleId, activity.activityId, latest.current);
      setSaved("saved");
    } catch {
      unsaved.current = true;
      setSaved("error");
    }
  }
  function change(next: string) {
    latest.current = next;
    setCode(next);
    unsaved.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(persist, SAVE_DELAY_MS);
  }
  // Leaving the step with unsaved code: save it now.
  useEffect(() => {
    const pending = unsaved;
    const waiting = timer;
    const draft = latest;
    return () => {
      window.clearTimeout(waiting.current);
      if (pending.current) void saveCodeDraft(token, moduleId, activity.activityId, draft.current).catch(() => undefined);
    };
  }, [token, moduleId, activity.activityId]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") return setTabMoves(true);
    if (e.key !== "Tab" || tabMoves || e.shiftKey) {
      if (e.key !== "Tab") setTabMoves(false);
      return;
    }
    e.preventDefault(); // a Tab in a code box indents
    const box = e.currentTarget;
    const { selectionStart: a, selectionEnd: b } = box;
    change(`${code.slice(0, a)}    ${code.slice(b)}`);
    requestAnimationFrame(() => box.setSelectionRange(a + 4, a + 4));
  }

  async function guard<T>(next: Phase, work: () => Promise<T>): Promise<T | null> {
    setProblem(null);
    setPhase("loading");
    try {
      await sharedRunner().run("", ""); // waits for Python to be ready, so the wait is shown as loading
      setPhase(next);
      return await work();
    } catch (err) {
      setProblem(err instanceof PythonLoadError ? err.message : "Something went wrong while running your code.");
      return null;
    } finally {
      setPhase("idle");
    }
  }
  const runCode = () =>
    guard("running", async () => {
      setRun(await sharedRunner().run(code, stdin));
    });
  const check = () =>
    guard("checking", async () => {
      const text = code;
      const found = await checkTests(text, activity.tests, (c, s, e) => sharedRunner().run(c, s, e));
      setOutcomes(found);
      setCheckedCode(text);
    });

  const passedCount = outcomes?.filter((o) => o.passed).length ?? 0;
  const failedIds = (outcomes ?? []).filter((o) => !o.passed).map((o) => o.testId);
  const current = outcomes !== null && checkedCode === code;
  async function submit() {
    // Check the current code first if it hasn't been checked, so the score matches what is sent.
    let found = current ? outcomes : null;
    if (!found) {
      const text = code;
      found = await guard("checking", async () => {
        const r = await checkTests(text, activity.tests, (c, s, e) => sharedRunner().run(c, s, e));
        setOutcomes(r);
        setCheckedCode(text);
        return r;
      });
      if (!found) return;
    }
    setSubmitting(true);
    setProblem(null);
    try {
      window.clearTimeout(timer.current);
      const r = await submitCode(token, moduleId, activity.activityId, submissionId, code, found.map((o) => ({ testId: o.testId, passed: o.passed })));
      setResult(r);
      setSubmissionId(crypto.randomUUID()); // a later try is a new submission
    } catch (err) {
      setProblem(playerMessage(err));
    } finally {
      setSubmitting(false);
    }
  }
  const busy = phase !== "idle" || submitting;

  return (
    <div>
      {finished && !result ? <p className="callout mb-4 font-bold">You have finished this exercise. You can keep practising here.</p> : null}
      <label htmlFor="code-box" className="label">Your code <span className="font-normal text-muted">(Python)</span></label>
      <textarea
        id="code-box"
        value={code}
        onChange={(e) => change(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => unsaved.current && void persist()}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        rows={Math.min(24, Math.max(10, code.split("\n").length + 2))}
        aria-describedby="code-help"
        className="field mt-1 block w-full resize-y font-mono text-[0.9375rem] leading-6"
        style={{ tabSize: 4, whiteSpace: "pre", overflowX: "auto" }}
      />
      <p id="code-help" className="mt-1 text-sm text-muted">
        Press Tab to indent. {tabMoves ? "Tab now moves to the next control." : "To leave the box with the keyboard, press Esc, then Tab."}{" "}
        <span aria-live="polite">{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved." : saved === "error" ? "Could not save your draft." : ""}</span>
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-bold text-brand">Typing input for your program (optional)</summary>
        <label htmlFor="code-stdin" className="mt-2 block text-sm text-muted">One line for each time your program calls input().</label>
        <textarea id="code-stdin" rows={2} className="field mt-1 font-mono" value={stdin} onChange={(e) => setStdin(e.target.value)} spellCheck={false} />
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-secondary" disabled={busy || !code.trim()} onClick={runCode}>
          <Icon name="play" className="size-4" />{phase === "running" ? "Running…" : "Run"}
        </button>
        <button type="button" className="btn btn-primary" disabled={busy || !code.trim()} onClick={check}>
          <Icon name="check" className="size-4" />{phase === "checking" ? "Checking…" : "Check my code"}
        </button>
        {starter && code !== starter ? (
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { if (window.confirm("Put back the code you started with? Your changes will be lost.")) { change(starter); setRun(null); setOutcomes(null); } }}>
            Start over
          </button>
        ) : null}
      </div>
      <div aria-live="polite">
        {phase === "loading" ? <p role="status" className="mt-3 text-muted">Getting Python ready. The first time takes a few seconds…</p> : null}
        {problem ? <p role="alert" className="callout callout-danger mt-3 font-bold text-danger">{problem}</p> : null}
      </div>

      {run ? (
        <section aria-labelledby="out-h" className="mt-5">
          <h3 id="out-h" className="text-base font-bold">What your program printed</h3>
          {problemOf(run) ? <p role="alert" className="callout callout-danger mt-2 font-bold text-danger">{problemOf(run)}</p> : null}
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-hairline bg-wash p-3 font-mono text-sm whitespace-pre-wrap">{run.stdout || (problemOf(run) ? "" : "(nothing was printed)")}{run.truncated ? "\n… (stopped: it printed too much)" : ""}</pre>
        </section>
      ) : null}

      {outcomes ? (
        <section aria-labelledby="tests-h" className="mt-5">
          <h3 id="tests-h" className="text-base font-bold">
            Tests: {passedCount} of {activity.tests.length} passing
          </h3>
          {!current ? <p className="mt-1 text-sm text-muted">You changed your code since this check. Check it again to see where you are.</p> : null}
          <ul className="mt-2 grid gap-2">
            {activity.tests.map((t) => {
              const o = outcomes.find((x) => x.testId === t.testId);
              return (
                <li key={t.testId} className={`rounded-xl border p-3 ${o?.passed ? "border-hairline bg-tint/50" : "border-line bg-surface"}`}>
                  <p className="flex items-start gap-2 font-bold">
                    <Icon name={o?.passed ? "check" : "alert"} className={`mt-0.5 size-5 shrink-0 ${o?.passed ? "text-brand" : "text-warning"}`} />
                    <span>{t.label} <span className="font-normal text-muted">· {o?.passed ? "Passed" : "Not yet"}</span></span>
                  </p>
                  {o && !o.passed ? (
                    <div className="mt-2 pl-7 text-sm">
                      {o.problem ? <p>{o.problem}</p> : (
                        <>
                          <p className="text-muted">{t.kind === "call" ? `Checked: ${t.expression}` : t.stdin ? `Input given: ${t.stdin.replace(/\n/g, " / ")}` : "Checked what your program prints"}</p>
                          <p>Expected <code className="rounded bg-wash px-1 font-mono whitespace-pre-wrap">{t.expected}</code></p>
                          <p>Got <code className="rounded bg-wash px-1 font-mono whitespace-pre-wrap">{o.actual === undefined || o.actual === "" ? "(nothing)" : o.actual}</code></p>
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {code.trim() ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
            {submitting ? "Submitting…" : outcomes && current && passedCount === activity.tests.length ? "Submit my code" : "Submit what I have"}
          </button>
          {!(outcomes && current && passedCount === activity.tests.length) ? (
            <p className="text-sm text-muted">You can submit even if some tests fail. Your teacher sees your code and score, and you can submit again later.</p>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div role="status" className="callout mt-5">
          <p className="font-bold">{result.passed ? "Well done! Every test you needed is passing." : `Submitted. ${result.testsPassed} of ${result.testsTotal} tests passing.`}</p>
          {!result.passed ? <p className="mt-1 text-sm">You can move on now, or keep fixing your code and submit again. Your best score is kept.</p> : null}
          <button type="button" className="btn btn-primary mt-3" onClick={() => onDone(result)}>Continue <Icon name="arrowRight" /></button>
        </div>
      ) : null}

      <HintBox token={token} moduleId={moduleId} activityId={activity.activityId} code={code} failedTests={failedIds} />
    </div>
  );
}
