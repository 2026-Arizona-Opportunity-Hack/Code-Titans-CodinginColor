"use client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ApiError } from "../../lib/api/client";
import { downloadExport } from "../../lib/api/exportCsv";
import { getGradebook, type GradebookCell } from "../../lib/api/reports";
import { TEACHER_ROLES } from "../../lib/api/staff";
import { Icon } from "../common/Icon";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${x}%`);
const gain = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${x > 0 ? "+" : ""}${x}`);

function Cell({ c }: { c?: GradebookCell }) {
  if (!c) return <td className="text-muted">—</td>;
  return (
    <td>
      <span className="block font-bold">{pct(c.percent)} done</span>
      <span className="block text-sm text-muted">Score {pct(c.score)} · Gain {gain(c.gain)} · {c.hints} hint{c.hints === 1 ? "" : "s"}</span>
    </td>
  );
}

function Body({ token, classId }: { token: string; classId: string }) {
  const book = useQuery({ queryKey: ["gradebook", token, classId], queryFn: ({ signal }) => getGradebook(token, classId, signal), retry: false, refetchOnMount: "always" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      await downloadExport(token, classId, "gradebook");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The gradebook could not be downloaded.");
    } finally {
      setBusy(false);
    }
  }
  const b = book.data;
  return (
    <>
      <PageHeader
        back={{ href: `/instructor/class/?id=${encodeURIComponent(classId)}`, label: "Back to class" }}
        title="Gradebook"
        description="Each student's completion, scores, learning gain and hints, module by module. Download it as a CSV for a school gradebook or credit records."
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={download} disabled={busy || !b || b.students.length === 0}>
          <Icon name="spreadsheet" className="size-5" /> {busy ? "Preparing…" : "Download CSV"}
        </button>
        <span className="text-sm text-muted">Opens in Excel, Google Sheets or Numbers. Each download is recorded in the audit log.</span>
      </div>
      {error ? <p role="alert" className="mt-3 font-bold text-danger">{error}</p> : null}
      {book.isPending ? <div role="status" aria-label="Loading gradebook" className="skeleton mt-6 h-40" /> : null}
      {book.isError ? <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">{book.error instanceof ApiError ? book.error.message : "We couldn't load the gradebook."}</p> : null}
      {b && b.students.length === 0 ? <p className="card mt-6 max-w-xl text-muted">No students in this class yet.</p> : null}
      {b && b.students.length > 0 ? (
        <>
          <div className="table-wrap mt-6">
            <table className="table-brand">
              <caption className="sr-only">Gradebook: one row per student, one column per module</caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Student</th>
                  <th scope="col">Grade</th>
                  {b.modules.map((m) => <th key={m.moduleId} scope="col">{m.title}</th>)}
                  <th scope="col">Overall</th>
                  <th scope="col">Asked most help on</th>
                </tr>
              </thead>
              <tbody>
                {b.students.map((s) => (
                  <tr key={s.studentId}>
                    <td>{s.rosterNumber}</td>
                    <th scope="row">{s.displayName}</th>
                    <td>{s.gradeLevel ?? "—"}</td>
                    {b.modules.map((m) => <Cell key={m.moduleId} c={s.modules[m.moduleId]} />)}
                    <td>
                      <span className="block font-bold">{pct(s.overall.completion)} done</span>
                      <span className="block text-sm text-muted">Score {pct(s.overall.score)} · Gain {gain(s.overall.gain)} · {s.overall.hints} hints</span>
                    </td>
                    <td>{s.overall.mostHelpOn ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-4 grid gap-1 text-sm text-muted sm:grid-cols-2">
            <div><dt className="inline font-bold">Done:</dt> <dd className="inline">{b.definitions.percent}.</dd></div>
            <div><dt className="inline font-bold">Score:</dt> <dd className="inline">{b.definitions.score}.</dd></div>
            <div><dt className="inline font-bold">Gain:</dt> <dd className="inline">{b.definitions.gain}.</dd></div>
            <div><dt className="inline font-bold">Hints:</dt> <dd className="inline">{b.definitions.hints}.</dd></div>
          </dl>
        </>
      ) : null}
    </>
  );
}

export function GradebookScreen() {
  const classId = useSearchParams().get("id") ?? "";
  return <StaffPage roles={TEACHER_ROLES}>{({ token }) => classId ? <Body token={token} classId={classId} /> : <p role="alert" className="callout callout-danger">No class was chosen.</p>}</StaffPage>;
}
