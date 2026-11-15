"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "../../lib/api/client";
import { getStudentDetail, type ActivityDetail, type StudentDetail } from "../../lib/api/reports";
import { StaffPage } from "../common/StaffPage";

const TYPE: Record<ActivityDetail["type"], string> = {
  video: "Video",
  slides: "Slides",
  check: "Check",
  exit: "Exit question",
  assessment: "Test",
  worksheet: "Worksheet",
};
const STATE: Record<ActivityDetail["state"], { label: string; badge: string }> = {
  complete: { label: "Complete", badge: "badge" },
  in_progress: { label: "In progress", badge: "badge" },
  available: { label: "Ready", badge: "badge badge-muted" },
  locked: { label: "Locked", badge: "badge badge-muted" },
};
const REVIEW = { pending: "Waiting for you to read it", auto: "Checked automatically", reviewed: "Reviewed" } as const;

const when = (value: number | string | null) =>
  value === null ? "" : new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function ModuleCard({ module }: { module: StudentDetail["modules"][number] }) {
  const gain = module.pre !== null && module.post !== null ? Math.round(module.post - module.pre) : null;
  return (
    <section aria-labelledby={`m-${module.moduleId}`} className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={`m-${module.moduleId}`}>{module.title}</h2>
        <span className="badge">{module.state === "complete" ? "Complete" : `${module.percent}% done`}</span>
      </div>
      <progress value={module.percent} max={100} aria-label={`${module.title} progress`} className="meter mt-3" />
      <p className="mt-3 text-sm text-muted">
        Pretest {module.pre === null ? "not taken" : `${Math.round(module.pre)}%`} · Post-test {module.post === null ? "not taken" : `${Math.round(module.post)}%`}
        {gain !== null ? <span className="ml-2 font-bold text-brand">Gain {gain >= 0 ? "+" : ""}{gain} points</span> : null}
      </p>
      <div className="table-wrap mt-4">
        <table className="table-brand text-sm">
          <caption className="sr-only">Activities in {module.title}</caption>
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">State</th>
              <th scope="col">Attempts</th>
              <th scope="col">Best score</th>
              <th scope="col">Time</th>
              <th scope="col">Finished</th>
            </tr>
          </thead>
          <tbody>
            {module.activities.map((a) => (
              <tr key={a.activityId}>
                <th scope="row" className="font-bold">{TYPE[a.type]}</th>
                <td><span className={STATE[a.state].badge}>{STATE[a.state].label}</span></td>
                <td>{a.attempts}</td>
                <td>{a.bestScore === null ? "–" : `${a.bestScore}%`}</td>
                <td>{a.activeMinutes > 0 ? `${a.activeMinutes} min` : "–"}</td>
                <td>{when(a.completedAt) || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DetailBody({ token, classId, studentId }: { token: string; classId: string; studentId: string }) {
  const detail = useQuery({
    queryKey: ["student-detail", token, classId, studentId],
    queryFn: ({ signal }) => getStudentDetail(token, classId, studentId, signal),
    retry: false,
    refetchOnMount: "always",
  });
  const back = `/instructor/class/progress/?id=${encodeURIComponent(classId)}`;
  const d = detail.data;
  const next = d?.resume ? d.modules.find((m) => m.moduleId === d.resume?.moduleId)?.title : undefined;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href={back}>← Progress</Link>
      </nav>

      {detail.isPending ? <div role="status" aria-label="Loading student" className="skeleton h-56" /> : null}
      {detail.isError ? (
        <div role="alert" className="callout callout-danger">
          <p className="font-bold text-danger">
            {detail.error instanceof ApiError && detail.error.status === 404 ? "That student isn't in this class." : "We couldn't load this student."}
          </p>
          <Link href={back} className="btn btn-secondary mt-3">
            Back to progress
          </Link>
        </div>
      ) : null}

      {d ? (
        <>
          <h1>
            {d.student.displayName} <span className="text-muted">#{d.student.rosterNumber}</span>
          </h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-muted">
            <span className={d.status === "active" ? "badge" : "badge badge-muted"}>{d.status === "active" ? "Active" : "Inactive"}</span>
            {d.student.externalId ? <span>School ID {d.student.externalId}</span> : null}
            <span>{next ? `Next step: ${next}` : "Nothing left to do"}</span>
          </p>

          <div className="mt-6 flex flex-col gap-4">
            {d.modules.length === 0 ? <p className="card text-muted">No modules are assigned to this class yet.</p> : null}
            {d.modules.map((m) => (
              <ModuleCard key={m.moduleId} module={m} />
            ))}
          </div>

          {d.submissions.length > 0 ? (
            <section aria-labelledby="subs-heading" className="mt-8">
              <h2 id="subs-heading">Worksheets submitted</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {d.submissions.map((s) => (
                  <li key={`${s.moduleId}-${s.activityId}-${s.submittedAt}`} className="card">
                    <p className="font-bold">
                      {d.modules.find((m) => m.moduleId === s.moduleId)?.title ?? s.moduleId} · submitted {when(s.submittedAt)}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {s.reviewStatus ? REVIEW[s.reviewStatus] : "Submitted"}
                      {s.autoScorePct !== null ? ` · automatic part: ${s.autoScorePct}%` : ""}
                      {s.reviewScore !== null ? ` · your score: ${s.reviewScore}%` : ""}
                    </p>
                    {s.reviewComment ? <p className="mt-1">{s.reviewComment}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}

export function StudentDetailScreen() {
  const params = useSearchParams();
  const classId = params.get("class") ?? "";
  const studentId = params.get("id") ?? "";
  return (
    <StaffPage roles={["instructor", "cic_admin"]}>
      {({ token }) =>
        classId && studentId ? (
          <DetailBody token={token} classId={classId} studentId={studentId} />
        ) : (
          <p role="alert" className="callout callout-danger">
            No student was chosen. Open this page from the progress list.
          </p>
        )
      }
    </StaffPage>
  );
}
