"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { assignModule, listAssignments, unassignModule } from "../../lib/api/assignments";
import { ApiError } from "../../lib/api/client";
import { listModules } from "../../lib/api/curriculum";
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

  const [pick, setPick] = useState("");
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
              busy={busy}
              onRemove={() => run(() => unassignModule(token, classId, a.moduleId))}
            />
          ))}
        </ol>
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
    <StaffPage roles={["instructor", "cic_admin"]}>
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
