import type { RunResult } from "./runner";

/** The part of a test the browser needs. The server's copy for students has exactly these fields. */
export type CodeTest = {
  testId: string;
  label: string;
  kind: "output" | "call";
  stdin?: string;
  expression?: string;
  expected: string;
};

export type TestOutcome = {
  testId: string;
  passed: boolean;
  /** What the code printed or returned, shown when a test fails. */
  actual?: string;
  /** Why it could not run: an error, or "took too long". */
  problem?: string;
};

/** Printed text, compared the way a teacher would: line endings and trailing spaces do not matter. */
export const normalizeOutput = (text: string): string =>
  text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/\s+$/, "")).join("\n").replace(/\n+$/, "");

/** What went wrong in plain words, or null when the program ran. */
export function problemOf(run: RunResult): string | null {
  if (run.timedOut) return "The program took too long and was stopped. Is there a loop that never ends?";
  if (run.error) return run.line ? `${run.error} (line ${run.line})` : run.error;
  return null;
}

/** Judge one test from one run. Pure, so it can be tested without Python. */
export function judge(test: CodeTest, run: RunResult): TestOutcome {
  const problem = problemOf(run);
  if (problem) return { testId: test.testId, passed: false, problem };
  if (test.kind === "call") {
    const got = run.value;
    const want = test.expected.trim();
    const passed = got !== null && (got.repr === want || got.str === want);
    return { testId: test.testId, passed, actual: got ? got.repr : undefined };
  }
  const actual = normalizeOutput(run.stdout);
  return { testId: test.testId, passed: actual === normalizeOutput(test.expected), actual: run.truncated ? `${actual}\n…` : actual };
}

/** Run every test against the code, one after another. */
export async function checkTests(
  code: string,
  tests: CodeTest[],
  run: (code: string, stdin: string, expression?: string) => Promise<RunResult>,
): Promise<TestOutcome[]> {
  const out: TestOutcome[] = [];
  for (const t of tests) {
    out.push(judge(t, await run(code, t.kind === "output" ? (t.stdin ?? "") : "", t.kind === "call" ? t.expression : undefined)));
  }
  return out;
}
