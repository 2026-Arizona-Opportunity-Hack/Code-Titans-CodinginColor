"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError } from "../../lib/api/client";
import { listClasses, searchStudents } from "../../lib/api/staff";
import { StaffPage } from "../common/StaffPage";

function Body({ token }: { token: string }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");
  // Wait for a pause in typing before asking the server.
  useEffect(() => {
    const t = window.setTimeout(() => setQ(text.trim()), 300);
    return () => window.clearTimeout(t);
  }, [text]);

  const classes = useQuery({ queryKey: ["classes", token], queryFn: ({ signal }) => listClasses(token, signal), retry: false });
  const found = useQuery({
    queryKey: ["student-search", token, q, classId],
    queryFn: ({ signal }) => searchStudents(token, { q, classId: classId || undefined }, signal),
    enabled: q.length > 0,
    retry: false,
  });
  const className = (id: string) => classes.data?.find((c) => c.classId === id)?.name ?? id;

  return (
    <>
      <h1>Find a student</h1>
      <p className="mt-1 text-muted">Search by name across your classes. Students with the same name show their class and number.</p>
      <div className="mt-6 flex flex-wrap gap-4">
        <div>
          <label htmlFor="find-name" className="block font-bold">Name</label>
          <input id="find-name" type="search" className="field mt-1 w-64 max-w-full" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="find-class" className="block font-bold">Class</label>
          <select id="find-class" className="field mt-1" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All my classes</option>
            {classes.data?.map((c) => <option key={c.classId} value={c.classId}>{c.name}</option>)}
          </select>
        </div>
      </div>
      {q.length === 0 ? <p className="mt-6 text-muted">Type a name to start.</p> : null}
      {found.isFetching ? <p role="status" className="mt-6 text-muted">Searching…</p> : null}
      {found.isError ? <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">{found.error instanceof ApiError ? found.error.message : "The search failed."}</p> : null}
      <div aria-live="polite">
        {found.data && !found.isFetching ? <p className="mt-6 text-sm text-muted">{found.data.students.length === 0 ? "No students match." : `${found.data.students.length} ${found.data.students.length === 1 ? "student" : "students"}${found.data.truncated ? ", and there are more. Type more of the name." : ""}`}</p> : null}
      </div>
      <ul className="mt-2 grid gap-2">
        {found.data?.students.map((s) => (
          <li key={s.studentId} className="card flex flex-wrap items-center justify-between gap-2">
            <span><strong>{s.displayName}</strong> <span className="text-muted">#{s.rosterNumber} · {className(s.classId)}{s.status === "inactive" ? " · inactive" : ""}</span></span>
            <Link href={`/instructor/student/?class=${encodeURIComponent(s.classId)}&id=${encodeURIComponent(s.studentId)}`} className="btn btn-secondary">Open<span className="sr-only"> {s.displayName}</span></Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function StudentSearchScreen() {
  return <StaffPage roles={["instructor", "cic_admin"]}>{({ token }) => <Body token={token} />}</StaffPage>;
}
