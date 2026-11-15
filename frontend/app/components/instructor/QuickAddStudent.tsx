"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../lib/api/client";
import { addStudent, GRADE_LEVELS, type AddedStudent } from "../../lib/api/roster";
import { Icon } from "../common/Icon";

/** Add one student with just a name and an optional grade, and show their login words once. */
export function QuickAddStudent({ token, classId, classCode, schoolName }: { token: string; classId: string; classCode: string; schoolName?: string | null }) {
  const qc = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState<AddedStudent | null>(null);

  const reset = () => { setName(""); setGrade(""); setError(""); setAdded(null); };
  const open = () => { reset(); dialog.current?.showModal(); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter the student's name.");
    if (trimmed.length > 100) return setError("Keep the name under 100 characters.");
    setBusy(true);
    setError("");
    try {
      const student = await addStudent(token, classId, { displayName: trimmed, ...(grade ? { gradeLevel: Number(grade) } : {}) });
      setAdded(student);
      ["roster", "class", "progress", "attention", "student-search"].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The student could not be added. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const link = added ? `${window.location.origin}/s/#${classCode}.${added.studentCode}` : "";
  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={open}>
        <Icon name="userPlus" className="size-5" /> Add a student
      </button>
      <dialog ref={dialog} aria-labelledby="quick-add-h" className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-line p-6 shadow-xl backdrop:bg-black/40">
        {!added ? (
          <form onSubmit={submit} noValidate>
            <h2 id="quick-add-h" className="text-xl">Add a student</h2>
            <label htmlFor="qa-name" className="mt-4 block font-bold">Name</label>
            <p id="qa-name-h" className="text-sm text-muted">Add a last initial if two students share a first name.</p>
            <input id="qa-name" className="field mt-1" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} aria-describedby="qa-name-h" autoComplete="off" autoFocus />
            <p className="mt-4 font-bold">School</p>
            <p className="mt-1 rounded-lg border border-line bg-tint px-3 py-2">{schoolName ?? "This class\u2019s school"}</p>
            <p className="text-sm text-muted">Students are in their class&apos;s school. To change it, an admin changes the class.</p>
            <label htmlFor="qa-grade" className="mt-4 block font-bold">Grade <span className="font-normal text-muted">(optional)</span></label>
            <select id="qa-grade" className="field mt-1 max-w-xs" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Not set</option>
              {GRADE_LEVELS.map((g) => <option key={g} value={g}>Grade {g}</option>)}
            </select>
            {error ? <p role="alert" className="mt-3 font-bold text-danger">{error}</p> : null}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add student"}</button>
            </div>
          </form>
        ) : (
          <div>
            <h2 id="quick-add-h" className="text-xl">{added.displayName} is in the class</h2>
            <p className="mt-1 text-sm text-muted">{schoolName ?? ""}{added.gradeLevel ? `${schoolName ? " · " : ""}Grade ${added.gradeLevel}` : ""}</p>
            {added.possibleDuplicateOf ? (
              <p className="callout mt-3 text-sm">A student with this name was already in the class. They were added as a separate student.</p>
            ) : null}
            <p className="mt-3 text-sm text-muted">Give them these now. The secret words are shown only once; you can issue new ones from the login sheet.</p>
            <dl className="mt-3 grid gap-2 rounded-lg border border-line p-4">
              <div><dt className="text-sm text-muted">Class code</dt><dd className="font-mono text-lg font-bold">{classCode}</dd></div>
              <div><dt className="text-sm text-muted">Secret words</dt><dd className="font-mono text-lg font-bold">{added.studentCode}</dd></div>
              <div><dt className="text-sm text-muted">Or this link</dt><dd className="break-all font-mono text-sm">{link}</dd></div>
            </dl>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(`Class code: ${classCode}\nSecret words: ${added.studentCode}\n${link}`)}>Copy</button>
              <button type="button" className="btn btn-secondary" onClick={reset}>Add another</button>
              <button type="button" className="btn btn-primary" onClick={() => dialog.current?.close()}>Done</button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
