"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError } from "../../lib/api/client";
import { listUsers } from "../../lib/api/admin";
import { addClassMember, getClass, rotateJoinCode, updateClass, type ClassDetail } from "../../lib/api/staff";
import { StaffPage } from "../common/StaffPage";

const msg = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const LIMITS = [
  ["stuckFailedAttempts", "Wrong attempts before a student shows as stuck", 1, 20],
  ["stuckTimeMultiplier", "Times longer than the estimate before a student shows as stuck", 1, 10],
  ["notStartedDays", "Days before a student shows as not started", 1, 14],
  ["inactiveSchoolDays", "School days without activity before a student shows as inactive", 1, 14],
] as const;

function AddInstructor({ token, classId }: { token: string; classId: string }) {
  const [userId, setUserId] = useState("");
  const [added, setAdded] = useState("");
  const users = useQuery({ queryKey: ["users", token], queryFn: ({ signal }) => listUsers(token, signal), retry: false });
  const add = useMutation({ mutationFn: () => addClassMember(token, classId, userId), onSuccess: () => { setAdded(users.data?.find((u) => u.userId === userId)?.name ?? "The instructor"); setUserId(""); } });
  const instructors = users.data?.filter((u) => u.role === "instructor" && u.enabled) ?? [];
  return (
    <section className="card mt-6 max-w-xl" aria-labelledby="inst-h">
      <h2 id="inst-h" className="text-lg">Add an instructor</h2>
      <p className="text-sm text-muted">Gives another instructor access to this class. Only CIC admins see this.</p>
      <label htmlFor="inst-pick" className="mt-3 block font-bold">Instructor</label>
      <select id="inst-pick" className="field mt-1 max-w-sm" value={userId} onChange={(e) => { setUserId(e.target.value); setAdded(""); }}>
        <option value="">Choose an instructor</option>
        {instructors.map((u) => <option key={u.userId} value={u.userId}>{u.name || u.email}</option>)}
      </select>
      {add.isError ? <p role="alert" className="mt-2 font-bold text-danger">{msg(add.error, "Could not add them.")}</p> : null}
      <div aria-live="polite">{added ? <p className="mt-2 font-bold text-brand">{added} can now open this class.</p> : null}</div>
      <button type="button" className="btn btn-secondary mt-3" disabled={!userId || add.isPending} onClick={() => add.mutate()}>Add to class</button>
    </section>
  );
}

function Form({ token, cls, isAdmin }: { token: string; cls: ClassDetail; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [name, setName] = useState(cls.name);
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(LIMITS.map(([k]) => [k, String(cls.settings[k])])));
  const [saved, setSaved] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["class", token, cls.classId] });

  const save = useMutation({
    mutationFn: () => updateClass(token, cls.classId, { name: name.trim(), settings: Object.fromEntries(LIMITS.map(([k]) => [k, Number(values[k])])) }),
    onSuccess: () => { setSaved("Saved."); refresh(); },
  });
  const archive = useMutation({
    mutationFn: () => updateClass(token, cls.classId, { status: cls.status === "active" ? "archived" : "active" }),
    onSuccess: refresh,
  });
  const rotate = useMutation({ mutationFn: () => rotateJoinCode(token, cls.classId), onSuccess: refresh });
  const valid = name.trim() !== "" && LIMITS.every(([k, , lo, hi]) => Number.isInteger(Number(values[k])) && values[k] !== "" && Number(values[k]) >= lo && Number(values[k]) <= hi);

  function submit(e: FormEvent) {
    e.preventDefault();
    setSaved("");
    if (valid) save.mutate();
  }
  return (
    <>
      <form onSubmit={submit} className="card mt-6 max-w-xl">
        <label htmlFor="cls-name" className="block font-bold">Class name</label>
        <input id="cls-name" className="field mt-1" value={name} maxLength={120} onChange={(e) => { setName(e.target.value); setSaved(""); }} />
        <h2 className="mt-6 text-lg">When to flag a student</h2>
        <p className="text-sm text-muted">These control the &ldquo;needs attention&rdquo; lists on the progress page.</p>
        {LIMITS.map(([k, label, lo, hi]) => (
          <div key={k} className="mt-3">
            <label htmlFor={`set-${k}`} className="block font-bold">{label}</label>
            <input id={`set-${k}`} type="number" min={lo} max={hi} className="field mt-1 max-w-28" value={values[k]} aria-describedby={`set-${k}-h`} onChange={(e) => { setValues({ ...values, [k]: e.target.value }); setSaved(""); }} />
            <p id={`set-${k}-h`} className="text-sm text-muted">A whole number from {lo} to {hi}.</p>
          </div>
        ))}
        {save.isError ? <p role="alert" className="mt-3 font-bold text-danger">{msg(save.error, "Could not save.")}</p> : null}
        <div aria-live="polite">{saved ? <p className="mt-3 font-bold text-brand">{saved}</p> : null}</div>
        <button type="submit" className="btn btn-primary mt-4" disabled={!valid || save.isPending}>{save.isPending ? "Saving…" : "Save settings"}</button>
      </form>

      <section className="card mt-6 max-w-xl" aria-labelledby="code-h">
        <h2 id="code-h" className="text-lg">Class code</h2>
        <p className="mt-1">Students sign in with <span className="font-mono font-bold">{cls.joinCode}</span> and their own three words.</p>
        <p className="text-sm text-muted">Make a new code if it was shared by mistake. The old code stops working straight away, and your printed login sheets need the new one.</p>
        {rotate.isError ? <p role="alert" className="mt-2 font-bold text-danger">{msg(rotate.error, "Could not change the code.")}</p> : null}
        <button type="button" className="btn btn-secondary mt-3" disabled={rotate.isPending} onClick={() => { if (window.confirm("Make a new class code? The old one stops working now.")) rotate.mutate(); }}>Make a new class code</button>
      </section>

      <section className="card mt-6 max-w-xl" aria-labelledby="arch-h">
        <h2 id="arch-h" className="text-lg">{cls.status === "active" ? "Archive this class" : "This class is archived"}</h2>
        <p className="text-sm text-muted">Archived classes are kept, with all progress, and can be restored.</p>
        {archive.isError ? <p role="alert" className="mt-2 font-bold text-danger">{msg(archive.error, "Could not change the class.")}</p> : null}
        <button type="button" className="btn btn-secondary mt-3" disabled={archive.isPending} onClick={() => archive.mutate()}>{cls.status === "active" ? "Archive class" : "Restore class"}</button>
      </section>
      {isAdmin ? <AddInstructor token={token} classId={cls.classId} /> : null}
    </>
  );
}

function Body({ token, classId, isAdmin }: { token: string; classId: string; isAdmin: boolean }) {
  const cls = useQuery({ queryKey: ["class", token, classId], queryFn: ({ signal }) => getClass(token, classId, signal), retry: false });
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm"><Link href={`/instructor/class/?id=${encodeURIComponent(classId)}`}>← Back to class</Link></nav>
      <h1>Class settings</h1>
      {cls.isPending ? <div role="status" aria-label="Loading" className="skeleton mt-6 h-40" /> : null}
      {cls.isError ? <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">{msg(cls.error, "We couldn't load this class.")}</p> : null}
      {cls.data ? <Form key={classId} token={token} cls={cls.data} isAdmin={isAdmin} /> : null}
    </>
  );
}

export function ClassSettingsScreen() {
  const classId = useSearchParams().get("id") ?? "";
  return <StaffPage roles={["instructor", "cic_admin"]}>{({ token, me }) => classId ? <Body token={token} classId={classId} isAdmin={me.role === "cic_admin"} /> : <p role="alert" className="callout callout-danger">No class was chosen.</p>}</StaffPage>;
}
