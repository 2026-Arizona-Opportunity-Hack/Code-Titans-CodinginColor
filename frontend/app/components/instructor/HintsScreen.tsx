"use client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ApiError } from "../../lib/api/client";
import { getHintReport } from "../../lib/api/reports";
import { TEACHER_ROLES } from "../../lib/api/staff";
import { Icon } from "../common/Icon";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";

const when = (ms: number) => new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

function Body({ token, classId }: { token: string; classId: string }) {
  const report = useQuery({ queryKey: ["hint-report", token, classId], queryFn: ({ signal }) => getHintReport(token, classId, signal), retry: false, refetchOnMount: "always" });
  const r = report.data;
  return (
    <>
      <PageHeader
        back={{ href: `/instructor/class/?id=${encodeURIComponent(classId)}`, label: "Back to class" }}
        title="Hints and struggles"
        description="Every time a student asks the AI tutor for a hint, it is logged here, so you can see which ideas to reteach and who needs a check-in."
      />
      {report.isPending ? <div role="status" aria-label="Loading hints" className="skeleton h-40" /> : null}
      {report.isError ? <p role="alert" className="callout callout-danger font-bold text-danger">{report.error instanceof ApiError ? report.error.message : "We couldn't load the hint report."}</p> : null}
      {r && r.totals.hints === 0 ? (
        <div className="empty">
          <span className="icon-tile"><Icon name="info" className="size-6" /></span>
          <h2 className="text-lg">No hints asked for yet</h2>
          <p className="max-w-md text-muted">Students can ask for a hint on check questions and code exercises. Their questions show up here.</p>
        </div>
      ) : null}
      {r && r.totals.hints > 0 ? (
        <>
          <p role="status" className="callout flex items-start gap-3">
            <Icon name="info" className="mt-0.5 size-5 shrink-0 text-brand" />
            <span>
              {r.totals.hints} hint{r.totals.hints === 1 ? "" : "s"} from {r.totals.studentsWhoAsked} of {r.totals.enrolled} students.
              {r.reteachFirst ? <> {r.reteachFirstIsStep ? "Go over first" : "Reteach first"}: <strong>{r.reteachFirst}</strong>. {r.reteachFirstIsStep ? "That step got the most hint requests." : "Most students who asked for help were stuck on it."}</> : null}
            </span>
          </p>

          <section aria-labelledby="by-concept" className="mt-8">
            <h2 id="by-concept">By concept</h2>
            <div className="table-wrap mt-3">
              <table className="table-brand">
                <caption className="sr-only">Hints asked for, by concept</caption>
                <thead><tr><th scope="col">Concept</th><th scope="col">Students who asked</th><th scope="col">Share of class</th><th scope="col">Hints</th></tr></thead>
                <tbody>{r.concepts.map((c) => (
                  <tr key={c.concept}><th scope="row">{c.concept}</th><td>{c.students}</td><td>{c.studentPct === null ? "—" : `${c.studentPct}%`}</td><td>{c.hints}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="by-step" className="mt-8">
            <h2 id="by-step">By step</h2>
            <div className="table-wrap mt-3">
              <table className="table-brand">
                <caption className="sr-only">Hints asked for, by module step</caption>
                <thead><tr><th scope="col">Module</th><th scope="col">Step</th><th scope="col">Students who asked</th><th scope="col">Hints</th></tr></thead>
                <tbody>{r.activities.map((a) => (
                  <tr key={`${a.moduleId}-${a.activityId}`}><th scope="row">{a.moduleTitle}</th><td>{a.activityTitle}</td><td>{a.students}</td><td>{a.hints}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="by-student" className="mt-8">
            <h2 id="by-student">By student</h2>
            <div className="table-wrap mt-3">
              <table className="table-brand">
                <caption className="sr-only">Hints asked for, by student</caption>
                <thead><tr><th scope="col">#</th><th scope="col">Student</th><th scope="col">Hints</th><th scope="col">Asked most about</th></tr></thead>
                <tbody>{r.students.map((s) => (
                  <tr key={s.studentId}><td>{s.rosterNumber ?? "—"}</td><th scope="row">{s.displayName ?? "Former student"}</th><td>{s.hints}</td><td>{s.topConcepts.join(", ") || "—"}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="recent" className="mt-8">
            <h2 id="recent">Latest hints</h2>
            <p className="mt-1 text-sm text-muted">What students asked and what the tutor answered, newest first. Hints never give the answer.</p>
            <ul className="mt-3 grid gap-3">
              {r.recent.map((h) => (
                <li key={`${h.at}-${h.studentId}`} className="card !p-4">
                  <p className="text-sm text-muted">
                    <strong className="text-ink">{h.displayName ?? "Former student"}</strong> · {h.moduleTitle} · {h.activityTitle} · {when(h.at)}
                    {h.concepts.length ? ` · ${h.concepts.join(", ")}` : ""} · hint level {h.level}
                  </p>
                  {h.question ? <p className="mt-2"><span className="font-bold">Asked:</span> {h.question}</p> : null}
                  <p className="mt-1"><span className="font-bold">Tutor:</span> {h.hint}{h.filtered ? <span className="badge badge-muted ml-2">safety fallback used</span> : null}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </>
  );
}

export function HintsScreen() {
  const classId = useSearchParams().get("id") ?? "";
  return <StaffPage roles={TEACHER_ROLES}>{({ token }) => classId ? <Body token={token} classId={classId} /> : <p role="alert" className="callout callout-danger">No class was chosen.</p>}</StaffPage>;
}
