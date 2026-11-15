"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useRequireStudent } from "../../context/StudentSessionContext";
import { logoutStudent } from "../../lib/api/student";
import { problemOf } from "../../lib/pyodide/checkTests";
import { PythonLoadError, sharedRunner, type RunResult } from "../../lib/pyodide/runner";
import { Icon } from "../common/Icon";
import { PublicShell } from "../common/PublicShell";
import { StudentShell } from "../common/StudentShell";

const EXAMPLES: { label: string; code: string; input?: string }[] = [
  { label: "Say hello", code: 'print("Hello, Python!")\n' },
  { label: "A loop", code: "for i in range(1, 6):\n    print(i)\n" },
  { label: "A function", code: "def double(n):\n    return n * 2\n\nprint(double(21))\n" },
  { label: "Typing input", code: 'name = input("What is your name? ")\nprint("Nice to meet you, " + name + "!")\n', input: "Ana" },
];
const START = '# Write Python here, then press Run.\nprint("Hello, Python!")\n';
const STORE = "cic.codeRunner.code"; // this tab only, so the next student on a shared computer never sees it

/**
 * A free practice space in the student menu: write Python, run it, see what it prints. Nothing here is graded,
 * saved on the server, or visible to a teacher. It reuses the same in-browser Python as coding exercises.
 */
export function CodeRunnerScreen() {
  const router = useRouter();
  const { session, hydrated, signOut } = useRequireStudent();
  // The page shows "Loading…" until the student session is read, so this never changes what the server rendered.
  const [code, setCode] = useState(() => (typeof window === "undefined" ? START : (window.sessionStorage.getItem(STORE) ?? START)));
  const [stdin, setStdin] = useState("");
  const [run, setRun] = useState<RunResult | null>(null);
  const [phase, setPhase] = useState<"idle" | "loading" | "running">("idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [tabMoves, setTabMoves] = useState(false); // Esc releases the Tab key so keyboard users can leave the box

  useEffect(() => {
    sharedRunner().warm(); // start loading Python while the student reads the page
  }, []);

  function change(next: string) {
    setCode(next);
    window.sessionStorage.setItem(STORE, next);
  }
  async function execute() {
    if (phase !== "idle" || !code.trim()) return;
    setProblem(null);
    setPhase("loading");
    try {
      await sharedRunner().run("", ""); // wait for Python, so the wait shows as loading and not as a slow run
      setPhase("running");
      setRun(await sharedRunner().run(code, stdin));
    } catch (err) {
      setProblem(err instanceof PythonLoadError ? err.message : "Something went wrong while running your code.");
    } finally {
      setPhase("idle");
    }
  }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void execute();
      return;
    }
    if (e.key === "Escape") return setTabMoves(true);
    if (e.key !== "Tab") return setTabMoves(false);
    if (tabMoves || e.shiftKey) return;
    e.preventDefault(); // a Tab in a code box indents
    const box = e.currentTarget;
    const { selectionStart: a, selectionEnd: b } = box;
    change(`${code.slice(0, a)}    ${code.slice(b)}`);
    requestAnimationFrame(() => box.setSelectionRange(a + 4, a + 4));
  }
  async function onSignOut() {
    if (session) {
      try {
        await logoutStudent(session.sessionToken);
      } catch {
        // Signing out here is enough if the server cannot be reached.
      }
    }
    window.sessionStorage.removeItem(STORE);
    signOut();
    router.replace("/s/");
  }

  if (!hydrated || !session) {
    return (
      <PublicShell>
        <p role="status" className="text-muted">Loading…</p>
      </PublicShell>
    );
  }
  const issue = run ? problemOf(run) : null;
  return (
    <StudentShell studentName={session.student.displayName} onSignOut={onSignOut}>
      <div className="mb-6">
        <p className="eyebrow">Practice</p>
        <h1 className="mt-1">Code runner</h1>
        <p className="lede">Write Python and see what it does. This is a practice space: nothing here is graded, and your teacher does not see it.</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label htmlFor="runner-code" className="label">Your code <span className="font-normal text-muted">(Python)</span></label>
        <div>
          <label htmlFor="runner-example" className="sr-only">Try an example</label>
          <select
            id="runner-example"
            className="field !min-h-9 !py-1 text-sm"
            value=""
            onChange={(e) => {
              const ex = EXAMPLES[Number(e.target.value)];
              if (!ex) return;
              if (code.trim() && code !== START && !window.confirm("Replace what you have written with this example?")) return;
              change(ex.code);
              setStdin(ex.input ?? "");
              setRun(null);
            }}
          >
            <option value="">Try an example…</option>
            {EXAMPLES.map((ex, i) => <option key={ex.label} value={i}>{ex.label}</option>)}
          </select>
        </div>
      </div>
      <textarea
        id="runner-code"
        value={code}
        onChange={(e) => change(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        rows={Math.min(24, Math.max(12, code.split("\n").length + 2))}
        aria-describedby="runner-help"
        className="field mt-1 block w-full resize-y font-mono text-[0.9375rem] leading-6"
        style={{ tabSize: 4, whiteSpace: "pre", overflowX: "auto" }}
      />
      <p id="runner-help" className="mt-1 text-sm text-muted">
        Press Tab to indent, and Ctrl+Enter (Command+Enter on a Mac) to run.{" "}
        {tabMoves ? "Tab now moves to the next control." : "To leave the box with the keyboard, press Esc, then Tab."}
      </p>

      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-bold text-brand">Typing input for your program (optional)</summary>
        <label htmlFor="runner-stdin" className="mt-2 block text-sm text-muted">One line for each time your program calls input().</label>
        <textarea id="runner-stdin" rows={2} className="field mt-1 font-mono" value={stdin} onChange={(e) => setStdin(e.target.value)} spellCheck={false} />
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={phase !== "idle" || !code.trim()} onClick={execute}>
          <Icon name="play" className="size-4" />{phase === "running" ? "Running…" : "Run"}
        </button>
        <button type="button" className="btn btn-ghost" disabled={phase !== "idle" || (code === START && !run)} onClick={() => { if (code === START || window.confirm("Clear your code and start again?")) { change(START); setRun(null); setStdin(""); } }}>
          Start over
        </button>
      </div>
      <div aria-live="polite">
        {phase === "loading" ? <p role="status" className="mt-3 text-muted">Getting Python ready. The first time takes a few seconds…</p> : null}
        {problem ? <p role="alert" className="callout callout-danger mt-3 font-bold text-danger">{problem}</p> : null}
      </div>

      {run ? (
        <section aria-labelledby="runner-out-h" className="mt-5">
          <h2 id="runner-out-h" className="text-base">What your program printed</h2>
          {issue ? <p role="alert" className="callout callout-danger mt-2 font-bold text-danger">{issue}</p> : null}
          <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-hairline bg-wash p-3 font-mono text-sm whitespace-pre-wrap">{run.stdout || (issue ? "" : "(nothing was printed)")}{run.truncated ? "\n… (stopped: it printed too much)" : ""}</pre>
        </section>
      ) : null}
    </StudentShell>
  );
}
