"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { assignModule, listAssignments, unassignModule, updateAssignment } from "../../lib/api/assignments";
import { ApiError } from "../../lib/api/client";
import { listModules } from "../../lib/api/curriculum";
import { getClass, updateClass, TEACHER_ROLES } from "../../lib/api/staff";
import { StaffPage } from "../common/StaffPage";
import { AssignmentRow } from "./AssignmentRow";

function AssignmentsBody({ token, classId }: { token: string; classId: string }) {
  const queryClient = useQueryClient();
  const classHref = `/instructor/class/?id=${encodeURIComponent(classId)}`;

  const assignments = useQuery({
    queryKey: ["assignments", token, classId],
    queryFn: ({ signal }) => listAssignments(token, classId, signal),
    retry: false,
  });
  const modules = useQuery({ queryKey: ["modules", token], queryFn: ({ signal }) => listModules(token, signal), retry: false });

  const cls = useQuery({ queryKey: ["class", token, classId], queryFn: ({ signal }) => getClass(token, classId, signal), retry: false });
  const [pick, setPick] = useState("");
  const [startPick, setStartPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = assignments.data ?? [];
  const titleOf = (id: string) => modules.data?.find((m) => m.moduleId === id)?.title ?? id;
  const assigned = new Set(list.map((a) => a.moduleId));
  const available = (modules.data ?? []).filter((m) => !assigned.has(m.moduleId));

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Positions are rewritten as 1..n so the order stays clean even if the saved numbers have gaps or ties.
  function move(index: number, direction: -1 | 1) {
    const next = [...list];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    return run(async () => {
      for (const [i, item] of next.entries()) {
        if (item.order !== i + 1) await updateAssignment(token, classId, item.moduleId, { order: i + 1 });
      }
    });
  }

  const currentModuleId = cls.data?.currentModuleId ?? null;
  const startValue = startPick || currentModuleId || "";

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href={classHref}>← Back to class</Link>
      </nav>
      <h1>Assigned modules</h1>
      <p className="mt-2 max-w-prose text-muted">
        Students work through these in order. A module opens when the one before it is complete.
      </p>

      {assignments.isPending ? <div role="status" aria-label="Loading assignments" className="skeleton mt-6 h-32" /> : null}
      {assignments.isError ? (
        <div role="alert" className="callout callout-danger mt-6">
          <p className="font-bold text-danger">
            {assignments.error instanceof ApiError ? assignments.error.message : "We couldn't load the assigned modules."}
          </p>
          <button type="button" className="btn btn-secondary mt-3" onClick={() => assignments.refetch()}>
            Try again
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">
          {error}
        </p>
      ) : null}

      {assignments.data && list.length === 0 ? (
        <p className="card mt-6 max-w-xl text-muted">No modules are assigned yet. Add the first one below.</p>
      ) : null}

      {list.length > 0 ? (
        <ol className="mt-6 flex flex-col gap-3">
          {list.map((a, i) => (
            <AssignmentRow
              key={a.moduleId}
              assignment={a}
              title={titleOf(a.moduleId)}
              index={i}
              count={list.length}
              busy={busy}
              latestVersion={modules.data?.find((m) => m.moduleId === a.moduleId)?.latestVersion ?? a.moduleVersion}
              onMove={(direction) => move(i, direction)}
              onDate={(date) => run(() => updateAssignment(token, classId, a.moduleId, { targetDate: date }))}
              onUpgrade={() =>
                run(() => updateAssignment(token, classId, a.moduleId, { moduleVersion: (modules.data?.find((m) => m.moduleId === a.moduleId)?.latestVersion ?? a.moduleVersion) }))
              }
              onRemove={() => run(() => unassignModule(token, classId, a.moduleId))}
            />
          ))}
        </ol>
      ) : null}

      {list.length > 0 ? (
        <section aria-labelledby="start-heading" className="card mt-10 max-w-xl">
          <h2 id="start-heading">Where late joiners start</h2>
          <p className="mt-2 text-muted">
            A student added later starts at this module. Earlier modules stay open as optional catch-up.
            {currentModuleId ? "" : " Nothing is set, so they start at the first module."}
          </p>
          <label htmlFor="start-module" className="mt-3 block font-bold">
            Class is currently on
          </label>
          <select id="start-module" value={startValue} onChange={(e) => setStartPick(e.target.value)} className="field mt-1">
            <option value="" disabled>
              Choose a module
            </option>
            {list.map((a) => (
              <option key={a.moduleId} value={a.moduleId}>
                {titleOf(a.moduleId)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary mt-4"
            disabled={busy || !startValue || startValue === currentModuleId}
            onClick={() =>
              run(async () => {
                await updateClass(token, classId, { currentModuleId: startValue });
                setStartPick("");
                await queryClient.invalidateQueries({ queryKey: ["class"] });
              })
            }
          >
            Save
          </button>
        </section>
      ) : null}

      <section aria-labelledby="add-heading" className="card mt-10 max-w-xl">
        <h2 id="add-heading">Add a module</h2>
        {modules.isError ? (
          <p role="alert" className="mt-2 text-danger">
            We couldn&apos;t load the module list.
          </p>
        ) : available.length === 0 && modules.data ? (
          <p className="mt-2 text-muted">Every published module is already assigned to this class.</p>
        ) : (
          <>
            <label htmlFor="module" className="mt-3 block font-bold">
              Module
            </label>
            <select
              id="module"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              disabled={modules.isPending}
              className="field mt-1"
            >
              <option value="">{modules.isPending ? "Loading modules…" : "Choose a module"}</option>
              {available.map((m) => (
                <option key={m.moduleId} value={m.moduleId}>
                  {m.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary mt-4"
              disabled={!pick || busy}
              onClick={() => run(async () => { await assignModule(token, classId, { moduleId: pick }); setPick(""); })}
            >
              {busy ? "Adding…" : "Add module"}
            </button>
          </>
        )}
      </section>
    </>
  );
}

export function AssignmentsScreen() {
  const classId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={TEACHER_ROLES}>
      {({ token }) =>
        classId ? (
          <AssignmentsBody token={token} classId={classId} />
        ) : (
          <p role="alert" className="callout callout-danger">
            No class was chosen. Open this page from a class.
          </p>
        )
      }
    </StaffPage>
  );
}
