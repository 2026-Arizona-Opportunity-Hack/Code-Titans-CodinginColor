"use client";
import { useState } from "react";
import type { DocActivity, DocCodeTest } from "../../lib/api/curriculum";
import { checkTests, type TestOutcome } from "../../lib/pyodide/checkTests";
import { PythonLoadError, sharedRunner } from "../../lib/pyodide/runner";
import { Icon } from "../common/Icon";

const MAX_TESTS = 20;
const rid = () => Math.random().toString(36).slice(2, 8);
export const newCodeTest = (kind: DocCodeTest["kind"] = "call"): DocCodeTest => ({ testId: `t-${rid()}`, label: "", kind, expected: "" });

/**
 * The fields of a coding exercise. The tests ship to the student's browser, so they are practice checks.
 * The reference solution stays on the server. "Try my solution" runs it against the tests here, with the same
 * Python the students get, so a wrong test is found before students meet it.
 */
export function CodeExerciseEditor({ a, id, set }: { a: DocActivity; id: string; set: (patch: Partial<DocActivity>) => void }) {
  const tests = a.tests ?? [];
  const [outcomes, setOutcomes] = useState<TestOutcome[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const setTest = (i: number, patch: Partial<DocCodeTest>) => set({ tests: tests.map((t, k) => (k === i ? { ...t, ...patch } : t)) });

  async function trySolution() {
    setBusy(true);
    setProblem("");
    setOutcomes(null);
    try {
      setOutcomes(await checkTests(a.solution ?? "", tests, (c, s, e) => sharedRunner().run(c, s, e)));
    } catch (err) {
      setProblem(err instanceof PythonLoadError ? err.message : "The solution could not be run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor={`${id}-starter`} className="label">Starter code <span className="font-normal text-muted">(what the student sees first)</span></label>
          <textarea id={`${id}-starter`} className="field mt-1 font-mono text-sm" rows={7} maxLength={4000} spellCheck={false} value={a.starterCode ?? ""} onChange={(e) => set({ starterCode: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-solution`} className="label">Your solution <span className="font-normal text-muted">(private)</span></label>
          <textarea id={`${id}-solution`} className="field mt-1 font-mono text-sm" rows={7} maxLength={4000} spellCheck={false} value={a.solution ?? ""} onChange={(e) => set({ solution: e.target.value })} aria-describedby={`${id}-solution-h`} />
          <p id={`${id}-solution-h`} className="mt-1 text-sm text-muted">Students never receive this. The AI hint is told not to give it away.</p>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h4 className="font-bold">Tests</h4>
            <p className="text-sm text-muted">
              A <strong>function</strong> test runs an expression such as <code>add(2, 3)</code> after the student&apos;s code and compares the result.
              A <strong>prints</strong> test runs the program with the typed input and compares what it prints. Students can see the tests, so these are practice checks.
            </p>
          </div>
        </div>
        <ol className="mt-3 grid list-none gap-3">
          {tests.map((t, i) => {
            const tid = `${id}-t${i}`;
            const o = outcomes?.find((x) => x.testId === t.testId);
            return (
              <li key={t.testId} className="rounded-xl border border-hairline bg-wash p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h5 className="flex items-center gap-2 font-bold">
                    <span className="avatar !size-7 !text-xs" aria-hidden="true">{i + 1}</span>Test {i + 1}
                    {o ? <span className={`badge ${o.passed ? "" : "badge-warn"}`}>{o.passed ? "Your solution passes" : "Your solution fails"}</span> : null}
                  </h5>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => set({ tests: tests.filter((_, k) => k !== i) })}>Remove<span className="sr-only"> test {i + 1}</span></button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${tid}-label`} className="label">What it checks</label>
                    <input id={`${tid}-label`} className="field mt-1" maxLength={120} placeholder="add(2, 3) gives 5" value={t.label} onChange={(e) => setTest(i, { label: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor={`${tid}-kind`} className="label">Kind</label>
                    <select id={`${tid}-kind`} className="field mt-1" value={t.kind} onChange={(e) => setTest(i, t.kind === e.target.value ? {} : { kind: e.target.value as DocCodeTest["kind"], expression: undefined, stdin: undefined })}>
                      <option value="call">A function: run an expression</option>
                      <option value="output">A program: compare what it prints</option>
                    </select>
                  </div>
                  {t.kind === "call" ? (
                    <div>
                      <label htmlFor={`${tid}-expr`} className="label">Expression</label>
                      <input id={`${tid}-expr`} className="field mt-1 font-mono text-sm" maxLength={200} placeholder="add(2, 3)" spellCheck={false} value={t.expression ?? ""} onChange={(e) => setTest(i, { expression: e.target.value })} />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor={`${tid}-stdin`} className="label">Typed input <span className="font-normal text-muted">(one line per input())</span></label>
                      <textarea id={`${tid}-stdin`} rows={2} className="field mt-1 font-mono text-sm" maxLength={500} spellCheck={false} value={t.stdin ?? ""} onChange={(e) => setTest(i, { stdin: e.target.value })} />
                    </div>
                  )}
                  <div>
                    <label htmlFor={`${tid}-exp`} className="label">{t.kind === "call" ? "Expected result" : "Expected output"}</label>
                    <textarea id={`${tid}-exp`} rows={2} className="field mt-1 font-mono text-sm" maxLength={1000} spellCheck={false} placeholder={t.kind === "call" ? "5" : "Hello, Ana"} value={t.expected} onChange={(e) => setTest(i, { expected: e.target.value })} />
                  </div>
                </div>
                {o && !o.passed ? <p className="mt-2 text-sm font-bold text-warning">{o.problem ?? `Your solution gave ${o.actual === undefined || o.actual === "" ? "nothing" : `"${o.actual}"`}.`}</p> : null}
              </li>
            );
          })}
        </ol>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {tests.length < MAX_TESTS ? <button type="button" className="btn btn-secondary" onClick={() => set({ tests: [...tests, newCodeTest()] })}><Icon name="plus" className="size-4" />Add a test</button> : null}
          <button type="button" className="btn btn-secondary" disabled={busy || !(a.solution ?? "").trim() || tests.length === 0} onClick={trySolution}>
            <Icon name="play" className="size-4" />{busy ? "Running…" : "Try my solution against the tests"}
          </button>
          {outcomes ? <p role="status" className="text-sm font-bold">{outcomes.filter((o) => o.passed).length} of {tests.length} tests pass with your solution</p> : null}
        </div>
        {problem ? <p role="alert" className="mt-2 font-bold text-danger">{problem}</p> : null}
      </div>

      <div>
        <label htmlFor={`${id}-pass`} className="label">Passing score (%)</label>
        <input id={`${id}-pass`} type="number" min={0} max={100} className="field mt-1 max-w-32" value={a.passPct ?? 100} onChange={(e) => set({ passPct: Number(e.target.value) })} aria-describedby={`${id}-pass-h`} />
        <p id={`${id}-pass-h`} className="mt-1 text-sm text-muted">Share of tests a student must pass to finish this step. Test results come from the student&apos;s own browser, so this is for practice, not for grading a test.</p>
      </div>
    </div>
  );
}
