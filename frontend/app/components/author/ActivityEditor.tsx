import type { DocActivity, DocQuestion } from "../../lib/api/curriculum";
import { QuestionEditor } from "./QuestionEditor";
import { SlideDeckEditor } from "./SlideDeckEditor";
import { WorksheetDocumentPicker } from "./WorksheetDocumentPicker";

const LABEL: Record<DocActivity["type"], string> = { video: "Video", slides: "Slides", check: "Check", worksheet: "Worksheet", exit: "Exit question", assessment: "Test" };
const rid = () => Math.random().toString(36).slice(2, 8);

export function newQuestion(worksheet: boolean): DocQuestion {
  return worksheet
    ? { fieldId: `f-${rid()}`, type: "text", prompt: "" }
    : { questionId: `q-${rid()}`, type: "mcq", prompt: "", points: 1, choices: [{ id: "a", text: "" }, { id: "b", text: "" }] };
}

export function ActivityEditor({ a, token, onChange, onRemove }: { a: DocActivity; token: string; onChange: (a: DocActivity) => void; onRemove?: () => void }) {
  const set = (patch: Partial<DocActivity>) => onChange({ ...a, ...patch });
  const worksheet = a.type === "worksheet";
  const listKey = worksheet ? "fields" : "questions";
  const items = (worksheet ? a.fields : a.questions) ?? [];
  const id = `act-${a.activityId}`;
  const hasQuestions = ["check", "exit", "assessment", "worksheet"].includes(a.type);

  return (
    <section className="card mt-4" aria-labelledby={`${id}-h`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 id={`${id}-h`} className="text-base font-bold">{a.title || LABEL[a.type]} <span className="badge badge-muted">{LABEL[a.type]}{a.role ? ` (${a.role === "pre" ? "pretest" : "post-test"})` : ""}</span></h3>
        {onRemove ? <button type="button" className="btn btn-secondary" onClick={onRemove}>Remove<span className="sr-only"> {a.title}</span></button> : null}
      </div>

      <label htmlFor={`${id}-title`} className="mt-3 block font-bold">Title</label>
      <input id={`${id}-title`} className="field mt-1" maxLength={120} value={a.title ?? ""} onChange={(e) => set({ title: e.target.value })} />

      {a.type !== "assessment" ? (
        <>
          <label htmlFor={`${id}-body`} className="mt-3 block font-bold">Text shown to students (optional)</label>
          <textarea id={`${id}-body`} className="field mt-1" rows={3} maxLength={4000} value={a.body ?? ""} onChange={(e) => set({ body: e.target.value })} />
        </>
      ) : null}

      {a.type === "video" ? (
        <div className="mt-3 flex flex-wrap gap-4">
          <div>
            <label htmlFor={`${id}-vid`} className="block font-bold">YouTube video ID</label>
            <input id={`${id}-vid`} className="field mt-1 max-w-48" maxLength={11} value={a.videoId ?? ""} onChange={(e) => set({ videoId: e.target.value.trim() })} aria-describedby={`${id}-vid-h`} />
            <p id={`${id}-vid-h`} className="text-sm text-muted">The 11 characters after v= in the video link.</p>
          </div>
          <div>
            <label htmlFor={`${id}-min`} className="block font-bold">Seconds to watch</label>
            <input id={`${id}-min`} type="number" min={0} max={3600} className="field mt-1 max-w-32" value={a.minSeconds ?? 0} onChange={(e) => set({ minSeconds: Number(e.target.value) })} />
          </div>
        </div>
      ) : null}

      {a.type === "slides" ? <SlideDeckEditor a={a} token={token} set={set} /> : null}

      {worksheet ? (
        <>
          <label htmlFor={`${id}-ins`} className="mt-3 block font-bold">Instructions</label>
          <textarea id={`${id}-ins`} className="field mt-1" rows={2} maxLength={4000} value={a.instructions ?? ""} onChange={(e) => set({ instructions: e.target.value })} />
          <WorksheetDocumentPicker a={a} token={token} set={set} />
        </>
      ) : null}

      {a.type === "check" ? (
        <div className="mt-3">
          <label htmlFor={`${id}-pass`} className="block font-bold">Passing score (%)</label>
          <input id={`${id}-pass`} type="number" min={0} max={100} className="field mt-1 max-w-32" value={a.passPct ?? 50} onChange={(e) => set({ passPct: Number(e.target.value) })} />
        </div>
      ) : null}

      {hasQuestions ? (
        <>
          <ol className="mt-4 grid list-none gap-3">
            {items.map((q, i) => (
              <QuestionEditor key={q.questionId ?? q.fieldId ?? i} q={q} n={i + 1} idPrefix={id} allowText={worksheet} assessment={a.type === "assessment"} needsKey={a.type === "check" || a.type === "assessment"}
                onChange={(next) => set({ [listKey]: items.map((x, k) => (k === i ? next : x)) })}
                onRemove={() => set({ [listKey]: items.filter((_, k) => k !== i) })} />
            ))}
          </ol>
          <button type="button" className="btn btn-secondary mt-3" onClick={() => set({ [listKey]: [...items, newQuestion(worksheet)] })}>{worksheet ? "Add a field" : "Add a question"}</button>
        </>
      ) : null}
    </section>
  );
}
