"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ApiError } from "../../lib/api/client";
import { getAttention, getProgress } from "../../lib/api/reports";
import { Icon } from "../common/Icon";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";
import { StatGrid } from "../common/StatGrid";
import { AttentionPanel } from "./AttentionPanel";
import { ProgressTable } from "./ProgressTable";
import { TEACHER_ROLES } from "../../lib/api/staff";

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
  return (
    <>
      <PageHeader
        back={{ href: classHref, label: "Back to class" }}
        title="Progress"
        description="Where each student is in the assigned modules."
        actions={
          <>
            <Link href={`/instructor/class/gain/?id=${encodeURIComponent(classId)}`} className="btn btn-ghost">Learning gain</Link>
            <Link href={`/instructor/class/concepts/?id=${encodeURIComponent(classId)}`} className="btn btn-ghost">Concepts</Link>
            <button type="button" className="btn btn-secondary" onClick={() => Promise.all([progress.refetch(), attention.refetch()])} disabled={progress.isFetching || attention.isFetching}>
              {progress.isFetching || attention.isFetching ? "Refreshing…" : "Refresh"}
            </button>
          </>
        }
      />
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
        <div className="empty">
          <span className="icon-tile"><Icon name="book" className="size-6" /></span>
          <h2 className="text-lg">No modules are assigned yet</h2>
          <p className="max-w-md text-muted">Assign a module to see how students are getting on.</p>
          <Link href={`/instructor/class/assignments/?id=${encodeURIComponent(classId)}`} className="btn btn-primary mt-2">
            Assigned modules
          </Link>
        </div>
      ) : null}

      {matrix && matrix.modules.length > 0 && students.length === 0 ? (
        <div className="empty">
          <span className="icon-tile"><Icon name="students" className="size-6" /></span>
          <h2 className="text-lg">No students yet</h2>
          <p className="max-w-md text-muted">Add the class list and each student gets a login.</p>
          <Link href={`/instructor/class/import/?id=${encodeURIComponent(classId)}`} className="btn btn-primary mt-2">
            Add students from a CSV
          </Link>
        </div>
      ) : null}

      {matrix && matrix.modules.length > 0 && students.length > 0 ? (
        <>
          <StatGrid
            items={[
              { label: "Students", value: students.length, icon: "students" },
              { label: "Finished every module", value: finished, icon: "check", hint: `${Math.round((finished / students.length) * 100)}% of the class` },
              { label: "Haven't started anything", value: notStarted, icon: "alert" },
            ]}
          />
          {attention.data ? (
            <AttentionPanel attention={attention.data} classId={classId} titleOf={(id) => matrix.modules.find((m) => m.moduleId === id)?.title ?? id} />
          ) : null}

          <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
            <div className="w-full max-w-sm">
              <label htmlFor="progress-search" className="label">Search by name</label>
              <input id="progress-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" className="field mt-1" />
            </div>
            <p aria-live="polite" className="text-sm text-muted">Showing {visible.length} of {students.length} students</p>
          </div>
          <div className="mt-4">
            {visible.length > 0 ? <ProgressTable matrix={matrix} students={visible} classId={classId} /> : <div className="empty"><p className="text-muted">No students match &ldquo;{search.trim()}&rdquo;.</p></div>}
          </div>
        </>
      ) : null}
    </>
  );
}

export function ProgressScreen() {
  const classId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={TEACHER_ROLES}>
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
