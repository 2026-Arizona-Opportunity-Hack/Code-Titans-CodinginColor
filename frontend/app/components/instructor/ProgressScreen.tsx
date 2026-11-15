"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ApiError } from "../../lib/api/client";
import { getAttention, getProgress } from "../../lib/api/reports";
import { StaffPage } from "../common/StaffPage";
import { AttentionPanel } from "./AttentionPanel";
import { ProgressTable } from "./ProgressTable";

const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

function ProgressBody({ token, classId }: { token: string; classId: string }) {
  const classHref = `/instructor/class/?id=${encodeURIComponent(classId)}`;
  const [search, setSearch] = useState("");
  const progress = useQuery({
    queryKey: ["progress", token, classId],
    queryFn: ({ signal }) => getProgress(token, classId, signal),
    retry: false,
    refetchOnMount: "always", // a teacher opening this page expects what students have done by now
  });

  const attention = useQuery({
    queryKey: ["attention", token, classId],
    queryFn: ({ signal }) => getAttention(token, classId, signal),
    retry: false,
    refetchOnMount: "always",
  });

  const matrix = progress.data;
  const visible = useMemo(() => {
    const needle = normalize(search);
    return (matrix?.students ?? []).filter((s) => !needle || normalize(s.displayName).includes(needle));
  }, [matrix, search]);

  const students = matrix?.students ?? [];
  const finished = students.filter((s) => matrix && matrix.modules.length > 0 && matrix.modules.every((m) => s.modules[m.moduleId]?.state === "complete")).length;
  const notStarted = students.filter((s) => matrix?.modules.every((m) => (s.modules[m.moduleId]?.percent ?? 0) === 0)).length;
  const tiles = [
    ["Students", students.length],
    ["Finished every module", finished],
    ["Haven't started anything", notStarted],
  ] as const;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href={classHref}>← Back to class</Link>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Progress</h1>
          <p className="mt-1 text-muted">Where each student is in the assigned modules.</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => Promise.all([progress.refetch(), attention.refetch()])}
          disabled={progress.isFetching || attention.isFetching}
        >
          {progress.isFetching || attention.isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {progress.isPending ? <div role="status" aria-label="Loading progress" className="skeleton mt-6 h-56" /> : null}
      {progress.isError ? (
        <div role="alert" className="callout callout-danger mt-6">
          <p className="font-bold text-danger">
            {progress.error instanceof ApiError ? progress.error.message : "We couldn't load the progress."}
          </p>
          <button type="button" className="btn btn-secondary mt-3" onClick={() => progress.refetch()}>
            Try again
          </button>
        </div>
      ) : null}

      {matrix && matrix.modules.length === 0 ? (
        <div className="card mt-6 max-w-xl">
          <p className="font-bold">No modules are assigned yet.</p>
          <p className="mt-1 text-muted">Assign a module to see how students are getting on.</p>
          <Link href={`/instructor/class/assignments/?id=${encodeURIComponent(classId)}`} className="btn btn-primary mt-4">
            Assigned modules
          </Link>
        </div>
      ) : null}

      {matrix && matrix.modules.length > 0 && students.length === 0 ? (
        <div className="card mt-6 max-w-xl">
          <p className="font-bold">No students yet.</p>
          <Link href={`/instructor/class/import/?id=${encodeURIComponent(classId)}`} className="btn btn-primary mt-4">
            Add students from a CSV
          </Link>
        </div>
      ) : null}

      {matrix && matrix.modules.length > 0 && students.length > 0 ? (
        <>
          <dl className="mt-6 grid grid-cols-3 gap-4">
            {tiles.map(([label, value]) => (
              <div key={label} className="card">
                <dt className="text-sm text-muted">{label}</dt>
                <dd className="mt-1 text-3xl font-bold text-brand">{value}</dd>
              </div>
            ))}
          </dl>

          {attention.data ? (
            <AttentionPanel attention={attention.data} titleOf={(id) => matrix.modules.find((m) => m.moduleId === id)?.title ?? id} />
          ) : null}

          <div className="mt-8 max-w-sm">
            <label htmlFor="progress-search" className="block font-bold">
              Search by name
            </label>
            <input id="progress-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" className="field mt-1" />
          </div>
          <p aria-live="polite" className="mt-3 text-sm text-muted">
            Showing {visible.length} of {students.length} students
          </p>
          <div className="mt-2">
            {visible.length > 0 ? <ProgressTable matrix={matrix} students={visible} /> : <p className="card text-muted">No students match.</p>}
          </div>
        </>
      ) : null}
    </>
  );
}

export function ProgressScreen() {
  const classId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={["instructor", "cic_admin"]}>
      {({ token }) =>
        classId ? (
          <ProgressBody token={token} classId={classId} />
        ) : (
          <p role="alert" className="callout callout-danger">
            No class was chosen. Open this page from a class.
          </p>
        )
      }
    </StaffPage>
  );
}
