import type { DocActivity, DocQuestion, ModuleDoc } from "../../lib/api/curriculum";
import { DocumentViewer } from "../common/DocumentViewer";

const TYPE_LABEL: Record<DocActivity["type"], string> = {
  video: "Video", slides: "Slides", check: "Check", worksheet: "Worksheet", exit: "Exit question", assessment: "Test",
};

function keyText(q: DocQuestion): string | null {
  const k = q.answerKey;
  if (k === undefined || k === null || k === "") return null;
  if (q.type === "mcq") return q.choices?.find((c) => c.id === k)?.text ?? String(k);
  if (q.type === "multi" && Array.isArray(k)) return k.map((id) => q.choices?.find((c) => c.id === id)?.text ?? id).join(", ");
  if (Array.isArray(k)) return k.join(" or ");
  if (typeof k === "object") return `${k.value}${k.tolerance ? ` (give or take ${k.tolerance})` : ""}`;
  return String(k);
}

function Question({ q, n }: { q: DocQuestion; n: number }) {
  const answer = keyText(q);
  return (
    <li className="mt-3">
      <p className="font-bold">{n}. {q.prompt || <span className="text-muted">(no prompt yet)</span>}</p>
      <p className="text-sm text-muted">
        {q.type}{q.concept ? ` · concept: ${q.concept}` : ""}{q.points !== undefined ? ` · ${q.points} point${q.points === 1 ? "" : "s"}` : ""}
      </p>
      {q.choices?.length ? (
        <ul className="mt-1 list-disc pl-6">
          {q.choices.map((c) => (
            <li key={c.id}>
              {c.text}
              {q.answerKey === c.id || (Array.isArray(q.answerKey) && q.answerKey.includes(c.id)) ? <strong className="text-brand"> (correct answer)</strong> : null}
            </li>
          ))}
        </ul>
      ) : answer ? (
        <p className="mt-1">Correct answer: <strong>{answer}</strong></p>
      ) : q.type === "text" ? <p className="mt-1 text-sm text-muted">Free-text answer, scored by a teacher.</p> : null}
      {q.explanation ? <p className="mt-1 text-sm">Explanation: {q.explanation}</p> : null}
    </li>
  );
}

function Activity({ a }: { a: DocActivity }) {
  const items = [...(a.questions ?? []), ...(a.fields ?? [])];
  return (
    <section className="card mt-4" aria-labelledby={`act-${a.activityId}`}>
      <h3 id={`act-${a.activityId}`} className="text-base font-bold">
        {a.title || TYPE_LABEL[a.type]} <span className="badge badge-muted">{TYPE_LABEL[a.type]}{a.role ? ` (${a.role})` : ""}</span>
      </h3>
      <p className="text-sm text-muted">
        {a.required === false ? "Optional" : "Required"}{a.estimatedMinutes ? ` · about ${a.estimatedMinutes} min` : ""}
      </p>
      {/* Plain text only: module text is never rendered as HTML. */}
      {a.body ? <p className="mt-2 whitespace-pre-wrap">{a.body}</p> : null}
      {a.instructions ? <p className="mt-2 whitespace-pre-wrap">{a.instructions}</p> : null}
      {a.type === "worksheet" && a.document ? <div className="mt-3"><DocumentViewer doc={a.document} title={`${a.title || "Worksheet"}: original worksheet`} /></div> : null}
      {a.type === "video" ? <p className="mt-2">YouTube video ID: <code>{a.videoId || "not set"}</code>{a.minSeconds ? ` · watch at least ${a.minSeconds} seconds` : ""}</p> : null}
      {a.type === "slides" && a.document ? (
        <div className="mt-3"><DocumentViewer doc={a.document} title={a.title || "Slides"} /></div>
      ) : a.type === "slides" ? (
        (a.slides ?? []).length > 0 ? (
          <ol className="mt-2 grid gap-2">
            {(a.slides ?? []).map((s, i) => (
              <li key={i} className="rounded-lg border border-line p-3">
                <p className="text-sm font-bold text-muted">Slide {i + 1}{s.title ? `: ${s.title}` : ""}</p>
                <p className="mt-1 whitespace-pre-wrap">{s.body}</p>
              </li>
            ))}
          </ol>
        ) : <p className="mt-2 text-muted">No slides yet.</p>
      ) : null}
      {a.type === "check" && a.passPct !== undefined ? <p className="mt-2 text-sm">Passing score: {a.passPct}%</p> : null}
      {items.length > 0 ? <ol className="list-none">{items.map((q, i) => <Question key={q.questionId ?? q.fieldId ?? i} q={q} n={i + 1} />)}</ol> : null}
    </section>
  );
}

/** Read-only view of a whole module, including answer keys. For staff only. */
export function ModuleView({ doc }: { doc: ModuleDoc }) {
  return (
    <>
      {doc.lessons.map((lesson) => (
        <section key={lesson.lessonId} className="mt-8" aria-labelledby={`les-${lesson.lessonId}`}>
          <h2 id={`les-${lesson.lessonId}`}>{lesson.title}</h2>
          {lesson.activities.map((a) => <Activity key={a.activityId} a={a} />)}
        </section>
      ))}
    </>
  );
}
