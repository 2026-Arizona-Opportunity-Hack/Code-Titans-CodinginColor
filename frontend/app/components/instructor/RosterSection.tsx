"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ApiError } from "../../lib/api/client";
import { listDuplicates, listRoster } from "../../lib/api/roster";
import { Icon } from "../common/Icon";

type StatusFilter = "active" | "inactive" | "all";

const normalize = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const STATUS_CHOICES: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "all", label: "Everyone" },
];

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
    <section aria-labelledby="roster-heading" className="mt-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="roster-heading" className="flex items-center gap-3">
          Students
          {roster.data ? <span className="badge badge-muted">{roster.data.length}</span> : null}
        </h2>
      </div>
      {roster.isPending ? <div role="status" aria-label="Loading students" className="skeleton h-48" /> : null}
      {roster.isError ? (
        <div role="alert" className="callout callout-danger">
          <p className="font-bold text-danger">We couldn&apos;t load the students.</p>
          <p className="mt-1 text-muted">{roster.error instanceof ApiError ? roster.error.message : "Please try again."}</p>
          <button type="button" className="btn btn-secondary mt-4" onClick={() => roster.refetch()}>
            Try again
          </button>
        </div>
      ) : null}
      {roster.data && roster.data.length === 0 ? (
        <div className="empty">
          <span className="icon-tile">
            <Icon name="students" className="size-6" />
          </span>
          <p className="text-lg font-bold">No students yet.</p>
          <p className="text-muted">Add your class list from a CSV file to get started.</p>
          <Link href={importHref} className="btn btn-primary mt-2">
            <Icon name="upload" className="size-5" />
            Add students from a CSV
          </Link>
        </div>
      ) : null}
      {roster.data && roster.data.length > 0 ? (
        <>
          <div className="mb-4 flex flex-col gap-3">
            {needLogin > 0 ? (
              <div className="callout flex items-start gap-3">
                <Icon name="info" className="mt-0.5 size-5 text-brand" />
                <div>
                  <p className="font-bold text-brand">
                    {needLogin} {needLogin === 1 ? "student needs" : "students need"} login words
                  </p>
                  <p className="text-sm text-muted">
                    They can&apos;t open their lessons yet.{" "}
                    <Link href={`/instructor/class/login-sheet/?id=${encodeURIComponent(classId)}`}>Create login words</Link>
                  </p>
                </div>
              </div>
            ) : null}
            {sameName.size > 0 ? (
              <div className="callout flex items-start gap-3">
                <Icon name="info" className="mt-0.5 size-5 text-brand" />
                <div>
                  <p className="font-bold text-brand">Some students share a name</p>
                  <p className="text-sm text-muted">
                    That is fine, since each has their own number. Check they are not the same person:{" "}
                    {(duplicates.data ?? [])
                      .map((g) => `${g.displayName} (${g.students.map((s) => `#${s.rosterNumber}`).join(", ")})`)
                      .join("; ")}
                    .
                  </p>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-72 max-w-full">
              <label htmlFor="roster-search" className="sr-only">
                Search by name
              </label>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
              <input
                id="roster-search"
                type="search"
                placeholder="Search by name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
                className="field pl-10"
              />
            </div>
            <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
              {STATUS_CHOICES.map((c) => (
                <button key={c.value} type="button" className="chip" aria-pressed={status === c.value} onClick={() => setStatus(c.value)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <p aria-live="polite" className="mb-2 text-sm text-muted">
            Showing {visible.length} of {roster.data.length} students
          </p>
          {visible.length === 0 ? (
            <div className="empty">
              <p className="font-bold">No students match.</p>
              <p className="text-sm text-muted">Try a different name or filter.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table-brand">
                <caption className="sr-only">Students in this class</caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Name</th>
                    <th scope="col">Grade</th>
                    {showSchoolId ? <th scope="col">School ID</th> : null}
                    <th scope="col">Login</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((s) => (
                    <tr key={s.studentId}>
                      <td className="text-muted">{s.rosterNumber}</td>
                      <th scope="row">
                        {s.displayName}
                        {s.status === "active" && sameName.has(normalize(s.displayName)) ? (
                          <span className="badge badge-warn ml-2">Same name</span>
                        ) : null}
                      </th>
                      <td>{s.gradeLevel ?? "—"}</td>
                      {showSchoolId ? <td>{s.externalId ?? "—"}</td> : null}
                      <td>
                        {s.hasCredential ? (
                          <span className="badge badge-dot">Ready</span>
                        ) : (
                          <span className="badge badge-warn badge-dot">Needs login words</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge badge-dot capitalize ${s.status === "active" ? "" : "badge-muted"}`}>{s.status}</span>
                      </td>
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
