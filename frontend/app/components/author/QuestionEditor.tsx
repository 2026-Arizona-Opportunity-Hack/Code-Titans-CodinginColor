import type { DocQuestion } from "../../lib/api/curriculum";

type Props = {
  q: DocQuestion;
  n: number;
  idPrefix: string;
  /** Worksheet fields can also be free text. */
  allowText: boolean;
  /** Assessment questions need a concept and points. */
  assessment: boolean;
  needsKey: boolean;
  onChange: (q: DocQuestion) => void;
  onRemove: () => void;
};

const TYPES: [DocQuestion["type"], string][] = [["mcq", "Pick one"], ["multi", "Pick several"], ["short", "Short text"], ["numeric", "Number"]];

export function QuestionEditor({ q, n, idPrefix, allowText, assessment, needsKey, onChange, onRemove }: Props) {
  const id = `${idPrefix}-${n}`;
  const set = (patch: Partial<DocQuestion>) => onChange({ ...q, ...patch });
  const choices = q.choices ?? [];
  const keyList = Array.isArray(q.answerKey) ? q.answerKey : typeof q.answerKey === "string" ? [q.answerKey] : [];

  function changeType(type: DocQuestion["type"]) {
    const withChoices = type === "mcq" || type === "multi";
    onChange({ ...q, type, answerKey: undefined, choices: withChoices ? (choices.length ? choices : [{ id: "a", text: "" }, { id: "b", text: "" }]) : undefined });
  }
  function toggle(choiceId: string) {
    if (q.type === "mcq") return set({ answerKey: choiceId });
    set({ answerKey: keyList.includes(choiceId) ? keyList.filter((k) => k !== choiceId) : [...keyList, choiceId] });
  }
  const numeric = typeof q.answerKey === "object" && !Array.isArray(q.answerKey) ? q.answerKey : { value: typeof q.answerKey === "number" ? q.answerKey : NaN };

  return (
    <li className="rounded-xl border border-hairline bg-wash p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h4 className="flex items-center gap-2 font-bold"><span className="avatar !size-7 !text-xs" aria-hidden="true">{n}</span>{allowText ? "Field" : "Question"} {n}</h4>
        <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}>Remove<span className="sr-only"> question {n}</span></button>
      </div>
      <label htmlFor={`${id}-prompt`} className="mt-2 block font-bold">Question</label>
      <textarea id={`${id}-prompt`} className="field mt-1" rows={2} maxLength={2000} value={q.prompt} onChange={(e) => set({ prompt: e.target.value })} />

      <label htmlFor={`${id}-type`} className="mt-2 block font-bold">Answer type</label>
      <select id={`${id}-type`} className="field mt-1 max-w-xs" value={q.type} onChange={(e) => changeType(e.target.value as DocQuestion["type"])}>
        {allowText ? <option value="text">Written answer (a teacher scores it)</option> : null}
        {TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>

      {q.type === "mcq" || q.type === "multi" ? (
        <fieldset className="mt-3">
          <legend className="font-bold">Choices. Mark the correct {q.type === "mcq" ? "one" : "ones"}.</legend>
          {choices.map((c, i) => (
            <div key={c.id} className="mt-2 flex flex-wrap items-center gap-2">
              <input type={q.type === "mcq" ? "radio" : "checkbox"} name={`${id}-key`} checked={keyList.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`Choice ${i + 1} is correct`} className="size-5" />
              <input className="field max-w-md flex-1" aria-label={`Choice ${i + 1} text`} maxLength={500} value={c.text} onChange={(e) => set({ choices: choices.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)) })} />
              {choices.length > 2 ? (
                <button type="button" className="btn btn-secondary" onClick={() => set({ choices: choices.filter((x) => x.id !== c.id), answerKey: keyList.filter((k) => k !== c.id).length ? (q.type === "mcq" ? undefined : keyList.filter((k) => k !== c.id)) : undefined })}>
                  Remove<span className="sr-only"> choice {i + 1}</span>
                </button>
              ) : null}
            </div>
          ))}
          {choices.length < 8 ? (
            <button type="button" className="btn btn-secondary mt-2" onClick={() => set({ choices: [...choices, { id: `c${Math.random().toString(36).slice(2, 7)}`, text: "" }] })}>Add a choice</button>
          ) : null}
        </fieldset>
      ) : null}

      {q.type === "short" ? (
        <>
          <label htmlFor={`${id}-key`} className="mt-3 block font-bold">Accepted answers, separated by commas</label>
          <input id={`${id}-key`} className="field mt-1" value={Array.isArray(q.answerKey) ? q.answerKey.join(", ") : typeof q.answerKey === "string" ? q.answerKey : ""}
            onChange={(e) => { const parts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); set({ answerKey: parts.length > 1 ? parts : (parts[0] ?? undefined) }); }} />
        </>
      ) : null}

      {q.type === "numeric" ? (
        <div className="mt-3 flex flex-wrap gap-4">
          <div>
            <label htmlFor={`${id}-num`} className="block font-bold">Correct number</label>
            <input id={`${id}-num`} type="number" step="any" className="field mt-1 max-w-40" value={Number.isNaN(numeric.value) ? "" : numeric.value}
              onChange={(e) => set({ answerKey: e.target.value === "" ? undefined : { value: Number(e.target.value), tolerance: numeric.tolerance } })} />
          </div>
          <div>
            <label htmlFor={`${id}-tol`} className="block font-bold">Give or take (optional)</label>
            <input id={`${id}-tol`} type="number" step="any" min={0} className="field mt-1 max-w-40" value={"tolerance" in numeric && numeric.tolerance !== undefined ? numeric.tolerance : ""}
              onChange={(e) => set({ answerKey: { value: numeric.value, tolerance: e.target.value === "" ? undefined : Number(e.target.value) } })} />
          </div>
        </div>
      ) : null}
      {needsKey && q.type !== "text" && (q.answerKey === undefined || q.answerKey === "") ? <p className="mt-2 text-sm text-muted">No correct answer set yet. It is needed before publishing.</p> : null}

      <div className="mt-3 flex flex-wrap gap-4">
        {assessment ? (
          <div>
            <label htmlFor={`${id}-concept`} className="block font-bold">Concept</label>
            <input id={`${id}-concept`} list="concept-options" className="field mt-1 max-w-48" maxLength={40} value={q.concept ?? ""} onChange={(e) => set({ concept: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
          </div>
        ) : null}
        {assessment ? (
          <div>
            <label htmlFor={`${id}-points`} className="block font-bold">Points</label>
            <input id={`${id}-points`} type="number" min={1} max={100} className="field mt-1 max-w-24" value={q.points ?? 1} onChange={(e) => set({ points: Number(e.target.value) })} />
          </div>
        ) : null}
        <div className="min-w-48 flex-1">
          <label htmlFor={`${id}-why`} className="block font-bold">Explanation (optional)</label>
          <input id={`${id}-why`} className="field mt-1" maxLength={2000} value={q.explanation ?? ""} onChange={(e) => set({ explanation: e.target.value })} />
        </div>
      </div>
    </li>
  );
}
