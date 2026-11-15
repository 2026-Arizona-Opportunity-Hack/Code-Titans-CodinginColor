"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { listAssignments } from "../../lib/api/assignments";
import { ApiError } from "../../lib/api/client";
import type { LoginSheet } from "../../lib/api/credentials";
import { listModules } from "../../lib/api/curriculum";
import { addStudent } from "../../lib/api/roster";
import { getClass } from "../../lib/api/staff";
import { StaffPage } from "../common/StaffPage";
import { LoginSheetCards } from "./LoginSheetCards";

function AddStudentBody({ token, classId }: { token: string; classId: string }) {
  const queryClient = useQueryClient();
  const classHref = `/instructor/class/?id=${encodeURIComponent(classId)}`;
  const cls = useQuery({ queryKey: ["class", token, classId], queryFn: ({ signal }) => getClass(token, classId, signal), retry: false });
  const assignments = useQuery({ queryKey: ["assignments", token, classId], queryFn: ({ signal }) => listAssignments(token, classId, signal), retry: false });
  const modules = useQuery({ queryKey: ["modules", token], queryFn: ({ signal }) => listModules(token, signal), retry: false });

  const [name, setName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [startModule, setStartModule] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<LoginSheet | null>(null);
  const [duplicate, setDuplicate] = useState(false);

  // The words cannot be shown again, so warn before the page closes while they are on screen.
  useEffect(() => {
    if (!sheet) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sheet]);

  const titleOf = (id: string) => modules.data?.find((m) => m.moduleId === id)?.title ?? id;
  const defaultStart = cls.data?.currentModuleId ? titleOf(cls.data.currentModuleId) : null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter the student's name.");
    if (trimmed.length > 100) return setError("Keep the name under 100 characters.");
    if (!cls.data) return setError("The class hasn't loaded yet. Try again in a moment.");
    setBusy(true);
    setError(null);
    try {
      const added = await addStudent(token, classId, {
        displayName: trimmed,
        ...(schoolId.trim() ? { externalId: schoolId.trim() } : {}),
        ...(startModule ? { startModuleId: startModule } : {}),
      });
      setDuplicate(Boolean(added.possibleDuplicateOf));
      setSheet({
        classCode: cls.data.joinCode,
        loginUrlBase: `${window.location.origin}/s`,
        students: [{ studentId: added.studentId, displayName: added.displayName, rosterNumber: added.rosterNumber, studentCode: added.studentCode }],
      });
      await Promise.all(["roster", "class", "progress", "attention"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function another() {
    setSheet(null);
    setName("");
    setSchoolId("");
    setDuplicate(false);
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="no-print mb-4 text-sm">
        <Link href={classHref}>← Back to class</Link>
      </nav>
      <h1>Add a student</h1>

      {sheet ? (
        <div className="mt-6">
          {duplicate ? (
            <p role="status" className="callout no-print mb-4">
              <span className="font-bold text-brand">A student with this name is already in the class.</span> They were added as a separate
              student. Two students can share a name.
            </p>
          ) : null}
          <LoginSheetCards sheet={sheet} />
          <div className="no-print mt-8 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={another}>
              Add another student
            </button>
            <Link href={classHref} className="btn btn-secondary">
              Done
            </Link>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 max-w-prose text-muted">
            For someone who joins after the class has started. They get their own login words and link straight away.
          </p>
          <form onSubmit={onSubmit} noValidate className="mt-6 flex max-w-xl flex-col gap-6">
            <div>
              <label htmlFor="name" className="block font-bold">
                Name
              </label>
              <p id="name-hint" className="text-sm text-muted">
                Add a last initial if two students share a first name.
              </p>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="off" aria-describedby="name-hint" className="field mt-1" />
            </div>
            <div>
              <label htmlFor="startModule" className="block font-bold">
                Where should they start?
              </label>
              <select id="startModule" value={startModule} onChange={(e) => setStartModule(e.target.value)} className="field mt-1">
                <option value="">{defaultStart ? `Where the class is now (${defaultStart})` : "The first module"}</option>
                {assignments.data?.map((a) => (
                  <option key={a.moduleId} value={a.moduleId}>
                    {titleOf(a.moduleId)}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-muted">Modules before this one stay open as optional catch-up.</p>
            </div>
            <div>
              <label htmlFor="schoolId" className="block font-bold">
                School ID <span className="font-normal text-muted">(optional)</span>
              </label>
              <p id="schoolId-hint" className="text-sm text-muted">
                Only if your school uses student numbers. It helps match this student if you import the class again.
              </p>
              <input id="schoolId" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} maxLength={64} autoComplete="off" aria-describedby="schoolId-hint" className="field mt-1" />
            </div>
            {error ? (
              <p role="alert" className="callout callout-danger font-bold text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Adding…" : "Add student"}
              </button>
              <Link href={classHref} className="btn btn-secondary">
                Cancel
              </Link>
            </div>
          </form>
        </>
      )}
    </>
  );
}

export function AddStudentScreen() {
  const classId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={["instructor", "cic_admin"]}>
      {({ token }) =>
        classId ? (
          <AddStudentBody token={token} classId={classId} />
        ) : (
          <p role="alert" className="callout callout-danger">
            No class was chosen. Open this page from a class.
          </p>
        )
      }
    </StaffPage>
  );
}
