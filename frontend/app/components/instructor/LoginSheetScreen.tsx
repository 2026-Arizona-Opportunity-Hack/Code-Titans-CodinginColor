"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "../../lib/api/client";
import { issueCredentials, type LoginSheet } from "../../lib/api/credentials";
import { listRoster } from "../../lib/api/roster";
import { StaffPage } from "../common/StaffPage";
import { LoginSheetCards } from "./LoginSheetCards";
import { TEACHER_ROLES } from "../../lib/api/staff";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function LoginSheetBody({ token, classId }: { token: string; classId: string }) {
  const queryClient = useQueryClient();
  const classHref = `/instructor/class/?id=${encodeURIComponent(classId)}`;
  const roster = useQuery({
    queryKey: ["roster", token, classId],
    queryFn: ({ signal }) => listRoster(token, classId, undefined, signal),
    retry: false,
  });

  const [sheet, setSheet] = useState<LoginSheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = (roster.data ?? []).filter((s) => s.status === "active");
  // Only students without words. Asking for everyone would reset the words of students who already have them.
  const needing = active.filter((s) => !s.hasCredential);

  // The words cannot be shown again, so warn before the page is closed or reloaded while they are on screen.
  useEffect(() => {
    if (!sheet) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sheet]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      setSheet(await issueCredentials(token, classId, needing.map((s) => s.studentId)));
      await queryClient.invalidateQueries({ queryKey: ["roster"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="no-print mb-4 text-sm">
        <Link href={classHref}>← Back to class</Link>
      </nav>
      <h1>Login sheet</h1>

      {roster.isPending ? <div role="status" aria-label="Loading students" className="skeleton mt-6 h-40" /> : null}

      {roster.isError ? (
        <div role="alert" className="callout callout-danger mt-6">
          <p className="font-bold text-danger">We couldn&apos;t load the students.</p>
          <button type="button" className="btn btn-secondary mt-3" onClick={() => roster.refetch()}>
            Try again
          </button>
        </div>
      ) : null}

      {sheet ? (
        <div className="mt-6">
          <LoginSheetCards sheet={sheet} />
          <p className="no-print mt-8">
            <Link href={classHref} className="btn btn-primary">
              Done
            </Link>
          </p>
        </div>
      ) : null}

      {!sheet && roster.data ? (
        <div className="card mt-6 max-w-xl">
          {needing.length > 0 ? (
            <>
              <h2>{plural(needing.length, "student needs", "students need")} login words</h2>
              <p className="mt-2 text-muted">
                Each student gets three secret words and a personal link. They open the link, or type the class code and
                words, to reach their lessons.
                {active.length > needing.length
                  ? ` ${plural(active.length - needing.length, "student already has", "students already have")} words and will not be changed.`
                  : ""}
              </p>
              {error ? (
                <p role="alert" className="callout callout-danger mt-4 font-bold text-danger">
                  {error}
                </p>
              ) : null}
              <button type="button" className="btn btn-primary mt-5" onClick={create} disabled={busy}>
                {busy ? "Creating…" : `Create login words for ${plural(needing.length, "student", "students")}`}
              </button>
            </>
          ) : active.length === 0 ? (
            <>
              <h2>No students yet</h2>
              <p className="mt-2 text-muted">Add your class list first, then come back to create login words.</p>
              <Link href={`/instructor/class/import/?id=${encodeURIComponent(classId)}`} className="btn btn-primary mt-5">
                Add students from a CSV
              </Link>
            </>
          ) : (
            <>
              <h2>Everyone already has login words</h2>
              <p className="mt-2 text-muted">Nobody in this class needs new words right now.</p>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}

export function LoginSheetScreen() {
  const classId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={TEACHER_ROLES}>
      {({ token }) =>
        classId ? (
          <LoginSheetBody token={token} classId={classId} />
        ) : (
          <p role="alert" className="callout callout-danger">
            No class was chosen. Open this page from a class.
          </p>
        )
      }
    </StaffPage>
  );
}
