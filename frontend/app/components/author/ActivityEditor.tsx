import type { DocActivity, DocQuestion } from "../../lib/api/curriculum";
import { Icon, type IconName } from "../common/Icon";
import { QuestionEditor } from "./QuestionEditor";
import { SlideDeckEditor } from "./SlideDeckEditor";
import { WorksheetDocumentPicker } from "./WorksheetDocumentPicker";

const LABEL: Record<DocActivity["type"], string> = { video: "Video", slides: "Slides", check: "Check", worksheet: "Worksheet", exit: "Exit question", assessment: "Test" };
/** The icon that stands for each kind of step, used here and in the outline beside the editor. */
export const ACTIVITY_ICON: Record<DocActivity["type"], IconName> = { video: "play", slides: "layers", check: "check", worksheet: "spreadsheet", exit: "target", assessment: "review" };
export const ACTIVITY_LABEL = LABEL;
const rid = () => Math.random().toString(36).slice(2, 8);

export function newQuestion(worksheet: boolean): DocQuestion {
  return worksheet
    ? { fieldId: `f-${rid()}`, type: "text", prompt: "" }
    : { questionId: `q-${rid()}`, type: "mcq", prompt: "", points: 1, choices: [{ id: "a", text: "" }, { id: "b", text: "" }] };
}

/** One line about what is inside a step, shown while it is collapsed. */
export function activitySummary(a: DocActivity): string {
  const count = (a.type === "worksheet" ? a.fields : a.questions)?.length ?? 0;
  if (a.type === "video") return a.videoId ? `YouTube ${a.videoId}` : "No video chosen yet";
  if (a.type === "slides") return `${a.slides?.length ?? 0} slide${(a.slides?.length ?? 0) === 1 ? "" : "s"}`;
  return `${count} ${a.type === "worksheet" ? "field" : "question"}${count === 1 ? "" : "s"}`;
}
export function ActivityEditor({ a, token, open, onToggle, onChange, onRemove }: { a: DocActivity; token: string; open: boolean; onToggle: () => void; onChange: (a: DocActivity) => void; onRemove?: () => void }) {
  const set = (patch: Partial<DocActivity>) => onChange({ ...a, ...patch });
  const worksheet = a.type === "worksheet";
  const listKey = worksheet ? "fields" : "questions";
  const items = (worksheet ? a.fields : a.questions) ?? [];
  const id = `act-${a.activityId}`;
  const hasQuestions = ["check", "exit", "assessment", "worksheet"].includes(a.type);

  return (
    <section id={id} className="card mt-4 scroll-mt-40 !p-0" aria-labelledby={`${id}-h`}>
      <div className="flex flex-wrap items-center gap-3 p-4">
        <h3 id={`${id}-h`} className="min-w-0 flex-1 text-base font-bold">
          <button type="button" className="flex w-full items-center gap-3 rounded-lg text-left text-brand" aria-expanded={open} aria-controls={`${id}-body`} onClick={onToggle}>
            <span className="icon-tile !size-10 shrink-0"><Icon name={ACTIVITY_ICON[a.type]} className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{a.title || LABEL[a.type]}</span>
              <span className="block text-sm font-normal text-muted">{LABEL[a.type]}{a.role ? ` (${a.role === "pre" ? "pretest" : "post-test"})` : ""} · {activitySummary(a)}</span>
            </span>
            <Icon name={open ? "chevronDown" : "chevronRight"} className="size-5 shrink-0 text-muted" />
          </button>
        </h3>
        {onRemove ? <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}><Icon name="trash" className="size-4" />Remove<span className="sr-only"> {a.title}</span></button> : null}
      </div>
      {open ? (
      <div id={`${id}-body`} className="border-t border-hairline p-4 pt-1">
      <label htmlFor={`${id}-title`} className="mt-3 block font-bold">Title</label>
      <input id={`${id}-title`} className="field mt-1" maxLength={120} value={a.title ?? ""} onChange={(e) => set({ title: e.target.value })} />

      {a.type !== "assessment" ? (
        <>
          <label htmlFor={`${id}-body`} className="mt-3 block font-bold">Text shown to students (optional)</label>
          <textarea id={`${id}-body`} className="field mt-1" rows={3} maxLength={4000} value={a.body ?? ""} onChange={(e) => set({ body: e.target.value })} />
        </>
      ) : null}

      {a.type === "video" || a.type === "slides" ? (
        <fieldset className="mt-3">
          <legend className="font-bold">This step shows</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {([["video", "A YouTube video"], ["slides", "Slides (PDF, PowerPoint or Google Slides)"]] as const).map(([kind, label]) => (
              <label key={kind} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-bold ${a.type === kind ? "border-brand bg-tint text-brand" : "border-line"}`}>
                <input type="radio" name={`${id}-kind`} checked={a.type === kind} className="size-4"
                  onChange={() => onChange(kind === "slides"
                    ? { activityId: a.activityId, type: "slides", title: a.title, body: a.body, required: a.required, minSeconds: a.minSeconds ?? 0, slides: a.slides ?? [] }
                    : { activityId: a.activityId, type: "video", title: a.title, body: a.body, required: a.required, minSeconds: a.minSeconds ?? 0, provider: "youtube", videoId: "" })} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
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
      </div>
      ) : null}
    </section>
  );
}
