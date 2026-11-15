/* A module worker: Pyodide 314 refuses to start in a classic worker. Start it with new Worker(url, { type: "module" }).
 * Runs student Python off the page's main thread, so a slow or endless program never freezes the lesson.
 * The page talks to it with messages:
 *   in:  { type: "init", indexURL }                         load Pyodide and the harness
 *        { type: "run", id, code, stdin, expression }       run one program
 *   out: { type: "ready" } | { type: "failed", message }
 *        { type: "result", id, result } | { type: "crashed", id, message }
 * The page ends this worker if a run takes too long. See pyodide-harness.py for what a run returns. */
let ready = null;
let runProgram = null;
self.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type === "init") {
    ready = (async () => {
      const { loadPyodide } = await import(msg.indexURL + "pyodide.mjs");
      const pyodide = await loadPyodide({ indexURL: msg.indexURL });
      const harness = await (await fetch(new URL("pyodide-harness.py", self.location.href))).text();
      pyodide.runPython(harness);
      runProgram = pyodide.globals.get("run");
    })();
    try {
      await ready;
      self.postMessage({ type: "ready" });
    } catch (err) {
      self.postMessage({ type: "failed", message: String((err && err.message) || err) });
    }
    return;
  }
  if (msg.type === "run") {
    try {
      await ready;
      const json = runProgram(msg.code, msg.stdin || "", msg.expression == null ? undefined : msg.expression);
      self.postMessage({ type: "result", id: msg.id, result: JSON.parse(json) });
    } catch (err) {
      self.postMessage({ type: "crashed", id: msg.id, message: String((err && err.message) || err) });
    }
  }
};
