"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { unlockModule } from "../../lib/api/assignments";
import { ApiError } from "../../lib/api/client";
import { deleteStudent, listDuplicates, mergeStudent, updateStudent } from "../../lib/api/roster";
import type { StudentDetail } from "../../lib/api/reports";

const msg = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);

/** Rename, deactivate, unlock a module early, or merge a duplicate. Each is one API call. */
export function StudentManage({ token, classId, detail, isAdmin, onMerged }: { token: string; classId: string; detail: StudentDetail; isAdmin: boolean; onMerged: () => void }) {
  const qc = useQueryClient();
  const s = detail.student;
  const [name, setName] = useState(s.displayName);
  const [moduleId, setModuleId] = useState("");
  const [into, setInto] = useState("");
  const [done, setDone] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["student-detail", token, classId, s.studentId] });
  const ok = (text: string) => () => { setDone(text); refresh(); };

  const dupes = useQuery({ queryKey: ["roster", "duplicates", token, classId], queryFn: ({ signal }) => listDuplicates(token, classId, signal), retry: false });
  const sameName = dupes.data?.find((g) => g.students.some((x) => x.studentId === s.studentId))?.students.filter((x) => x.studentId !== s.studentId) ?? [];
  const locked = detail.modules.filter((m) => m.state === "locked" || m.state === "catch_up");

  const rename = useMutation({ mutationFn: () => updateStudent(token, classId, s.studentId, { displayName: name.trim() }), onSuccess: ok("Name saved.") });
  const status = useMutation({ mutationFn: () => updateStudent(token, classId, s.studentId, { status: detail.status === "active" ? "inactive" : "active" }), onSuccess: ok("Saved.") });
  const unlock = useMutation({ mutationFn: () => unlockModule(token, classId, s.studentId, moduleId), onSuccess: ok("Module unlocked for this student.") });
  const merge = useMutation({ mutationFn: () => mergeStudent(token, classId, s.studentId, into), onSuccess: () => { qc.invalidateQueries({ queryKey: ["roster"] }); onMerged(); } });
  const remove = useMutation({ mutationFn: () => deleteStudent(token, classId, s.studentId), onSuccess: () => { qc.invalidateQueries({ queryKey: ["roster"] }); onMerged(); } });
  const error = [rename, status, unlock, merge, remove].find((m) => m.isError)?.error;

  return (
    <section aria-labelledby="manage-h" className="card mt-8">
      <h2 id="manage-h">Manage this student</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="stu-name" className="block font-bold">Name</label>
          <input id="stu-name" className="field mt-1 w-64 max-w-full" value={name} maxLength={100} onChange={(e) => { setName(e.target.value); setDone(""); }} />
        </div>
        <button type="button" className="btn btn-secondary" disabled={rename.isPending || !name.trim() || name.trim() === s.displayName} onClick={() => rename.mutate()}>Save name</button>
        <button type="button" className="btn btn-secondary" disabled={status.isPending} onClick={() => status.mutate()}>{detail.status === "active" ? "Mark inactive" : "Mark active"}</button>
      </div>

      {locked.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="stu-unlock" className="block font-bold">Let them start a locked module</label>
            <select id="stu-unlock" className="field mt-1" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
              <option value="">Choose a module</option>
              {locked.map((m) => <option key={m.moduleId} value={m.moduleId}>{m.title}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-secondary" disabled={!moduleId || unlock.isPending} onClick={() => unlock.mutate()}>Unlock</button>
        </div>
      ) : null}

      {sameName.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="stu-merge" className="block font-bold">Same person twice? Merge into</label>
            <select id="stu-merge" className="field mt-1" value={into} onChange={(e) => setInto(e.target.value)}>
              <option value="">Choose a student</option>
              {sameName.map((x) => <option key={x.studentId} value={x.studentId}>{s.displayName} #{x.rosterNumber}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-secondary" disabled={!into || merge.isPending} onClick={() => { if (window.confirm(`Merge #${s.rosterNumber} into the chosen student? #${s.rosterNumber} is removed and their progress moves over.`)) merge.mutate(); }}>Merge</button>
        </div>
      ) : null}

      {isAdmin ? (
        <div className="mt-5">
          <button type="button" className="btn btn-secondary" disabled={remove.isPending} onClick={() => { if (window.confirm(`Delete ${s.displayName} #${s.rosterNumber} and all their progress? This can't be undone.`)) remove.mutate(); }}>Delete this student</button>
          <p className="mt-1 text-sm text-muted">Only CIC admins can do this. To keep their results, mark them inactive instead.</p>
        </div>
      ) : null}

      <div aria-live="polite">{done ? <p className="mt-3 font-bold text-brand">{done}</p> : null}</div>
      {error ? <p role="alert" className="mt-3 font-bold text-danger">{msg(error, "That didn't work.")}</p> : null}
    </section>
  );
}
