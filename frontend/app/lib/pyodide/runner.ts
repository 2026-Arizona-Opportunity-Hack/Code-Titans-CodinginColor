import { env } from "../../config/env";

/** What one run of a program returns (see public/pyodide-harness.py). */
export type RunResult = {
  stdout: string;
  /** "NameError: name 'x' is not defined", or null when the program ran. */
  error: string | null;
  /** The line in the student's code the error came from. */
  line: number | null;
  /** For a call test: the value of the expression, as repr() and str(). */
  value: { repr: string; str: string } | null;
  /** The program printed more than the output limit, so it was stopped. */
  truncated: boolean;
  /** The program ran too long and was stopped. */
  timedOut?: boolean;
};

const LOAD_TIMEOUT_MS = 90_000; // the first load downloads about 12 MB
const RUN_TIMEOUT_MS = 5_000;

export class PythonLoadError extends Error {}

/**
 * Runs Python in the browser with Pyodide, inside a Web Worker. Python is loaded the first time it
 * is needed and then stays loaded. A run that takes longer than the limit ends the worker (the only
 * way to stop an endless loop), and the next run starts a fresh one.
 */
export class PythonRunner {
  private worker: Worker | null = null;
  private starting: Promise<Worker> | null = null;
  private seq = 0;

  private start(): Promise<Worker> {
    if (this.starting) return this.starting;
    this.starting = new Promise<Worker>((resolve, reject) => {
      const worker = new Worker("/pyodide-worker.js", { type: "module" });
      const timer = window.setTimeout(() => fail("Python took too long to load."), LOAD_TIMEOUT_MS);
      const fail = (message: string) => {
        window.clearTimeout(timer);
        worker.terminate();
        this.starting = null;
        reject(new PythonLoadError(message));
      };
      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === "ready") {
          window.clearTimeout(timer);
          this.worker = worker;
          resolve(worker);
        } else if (e.data.type === "failed") {
          fail("Python could not be loaded. Check your connection and try again.");
        }
      };
      worker.onerror = () => fail("Python could not be loaded. Check your connection and try again.");
      worker.postMessage({ type: "init", indexURL: env.pyodideUrl });
    });
    return this.starting;
  }

  /** Start loading now, so Python is ready by the time the student presses Run. Safe to call often. */
  warm(): void {
    void this.start().catch(() => undefined);
  }

  async run(code: string, stdin = "", expression?: string): Promise<RunResult> {
    const worker = await this.start();
    const id = ++this.seq;
    return new Promise<RunResult>((resolve) => {
      const done = (result: RunResult) => {
        window.clearTimeout(timer);
        worker.removeEventListener("message", onMessage);
        resolve(result);
      };
      const onMessage = (e: MessageEvent) => {
        if (e.data.id !== id) return;
        if (e.data.type === "result") done(e.data.result as RunResult);
        else if (e.data.type === "crashed") done({ stdout: "", error: "The program could not be run.", line: null, value: null, truncated: false });
      };
      const timer = window.setTimeout(() => {
        // Ending the worker is the only way to stop an endless loop. The next run loads Python again (cached, so quick).
        worker.terminate();
        this.worker = null;
        this.starting = null;
        resolve({ stdout: "", error: null, line: null, value: null, truncated: false, timedOut: true });
      }, RUN_TIMEOUT_MS);
      worker.addEventListener("message", onMessage);
      worker.postMessage({ type: "run", id, code, stdin, expression });
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.starting = null;
  }
}

let shared: PythonRunner | null = null;
/** One runner for the whole page, so Python stays loaded when the student moves between steps. */
export function sharedRunner(): PythonRunner {
  if (!shared) shared = new PythonRunner();
  return shared;
}
