"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ApiError } from "../../lib/api/client";
import { listDuplicates, listRoster } from "../../lib/api/roster";

type StatusFilter = "active" | "inactive" | "all";

const normalize = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const fieldClass = "mt-1 min-h-11 rounded-lg border-2 border-muted bg-surface px-3 py-2";

/** The class's students: search, status filter, and a flag on names that appear more than once. */
export function RosterSection({ token, classId }: { token: string; classId: string }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");

  const roster = useQuery({
    queryKey: ["roster", token, classId],
    queryFn: ({ signal }) => listRoster(token, classId, undefined, signal),
    retry: false,
  });
  const duplicates = useQuery({
    queryKey: ["roster", "duplicates", token, classId],
    queryFn: ({ signal }) => listDuplicates(token, classId, signal),
    retry: false,
  });

  const sameName = useMemo(() => new Set((duplicates.data ?? []).map((g) => normalize(g.displayName))), [duplicates.data]);

  const visible = useMemo(() => {
    const needle = normalize(search);
    return (roster.data ?? []).filter(
      (s) => (status === "all" || s.status === status) && (!needle || normalize(s.displayName).includes(needle)),
    );
  }, [roster.data, search, status]);

  const needLogin = (roster.data ?? []).filter((s) => s.status === "active" && !s.hasCredential).length;
  const showSchoolId = (roster.data ?? []).some((s) => s.externalId);
  const importHref = `/instructor/class/import/?id=${encodeURIComponent(classId)}`;

  return (
    <section aria-labelledby="roster-heading" className="mt-10">
      <h2 id="roster-heading" className="text-2xl">
        Students
      </h2>

      {roster.isPending ? (
        <div role="status" aria-label="Loading students" className="mt-4 h-40 animate-pulse rounded-xl bg-tint" />
      ) : null}

      {roster.isError ? (
        <div role="alert" className="mt-4 rounded-xl border-2 border-danger p-5">
          <p className="font-bold text-danger">We couldn&apos;t load the students.</p>
          <p className="mt-1 text-muted">{roster.error instanceof ApiError ? roster.error.message : "Please try again."}</p>
          <button type="button" className="btn btn-secondary mt-4" onClick={() => roster.refetch()}>
            Try again
          </button>
        </div>
      ) : null}

      {roster.data && roster.data.length === 0 ? (
        <div className="mt-4 rounded-xl border border-line p-8 text-center">
          <p className="text-lg font-bold">No students yet.</p>
          <p className="mt-1 text-muted">Add your class list from a CSV file to get started.</p>
          <Link href={importHref} className="btn btn-primary mt-4">
            Add students from a CSV
          </Link>
        </div>
      ) : null}

      {roster.data && roster.data.length > 0 ? (
        <>
          {needLogin > 0 ? (
            <div className="callout mt-4">
              <p className="font-bold text-brand">
                {needLogin} {needLogin === 1 ? "student needs" : "students need"} login words
              </p>
              <p className="text-sm text-muted">
                They can&apos;t open their lessons yet.{" "}
                <Link href={`/instructor/class/login-sheet/?id=${encodeURIComponent(classId)}`}>Create login words</Link>
              </p>
            </div>
          ) : null}

          {sameName.size > 0 ? (
            <div className="mt-4 rounded-xl border-l-8 border-accent bg-tint p-4">
              <p className="font-bold text-brand">Some students share a name</p>
              <p className="text-sm text-muted">
                That is fine, since each has their own number. Check they are not the same person:{" "}
                {(duplicates.data ?? [])
                  .map((g) => `${g.displayName} (${g.students.map((s) => `#${s.rosterNumber}`).join(", ")})`)
                  .join("; ")}
                .
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="roster-search" className="block font-bold">
                Search by name
              </label>
              <input
                id="roster-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
                className={`${fieldClass} w-64 max-w-full`}
              />
            </div>
            <div>
              <label htmlFor="roster-status" className="block font-bold">
                Show
              </label>
              <select
                id="roster-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                className={fieldClass}
              >
                <option value="active">Active students</option>
                <option value="inactive">Inactive students</option>
                <option value="all">Everyone</option>
              </select>
            </div>
          </div>

          <p aria-live="polite" className="mt-3 text-sm text-muted">
            Showing {visible.length} of {roster.data.length} students
          </p>

          {visible.length === 0 ? (
            <p className="mt-2 rounded-xl border border-line p-5 text-muted">No students match.</p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-line">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Students in this class</caption>
                <thead className="bg-brand text-on-brand">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-bold">#</th>
                    <th scope="col" className="px-4 py-3 font-bold">Name</th>
                    {showSchoolId ? <th scope="col" className="px-4 py-3 font-bold">School ID</th> : null}
                    <th scope="col" className="px-4 py-3 font-bold">Login</th>
                    <th scope="col" className="px-4 py-3 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <tr key={s.studentId} className="even:bg-tint">
                      <td className="px-4 py-3">{s.rosterNumber}</td>
                      <th scope="row" className="px-4 py-3 font-bold">
                        {s.displayName}
                        {s.status === "active" && sameName.has(normalize(s.displayName)) ? (
                          <span className="ml-2 rounded bg-surface px-2 py-0.5 text-xs font-bold text-brand">Same name</span>
                        ) : null}
                      </th>
                      {showSchoolId ? <td className="px-4 py-3">{s.externalId ?? "—"}</td> : null}
                      <td className="px-4 py-3">{s.hasCredential ? "Ready" : "Needs login words"}</td>
                      <td className="px-4 py-3 capitalize">{s.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
