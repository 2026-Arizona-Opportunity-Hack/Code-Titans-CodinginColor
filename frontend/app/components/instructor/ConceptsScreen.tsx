"use client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ApiError } from "../../lib/api/client";
import { getConcepts } from "../../lib/api/reports";
import { TEACHER_ROLES } from "../../lib/api/staff";
import { Icon } from "../common/Icon";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";
const num = (x: number | null, s = "") => (x === null ? "—" : `${x}${s}`);
/** A "mastered" bar with the number beside it, so the meaning never depends on the bar alone. */
function Mastery({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return <span className="text-muted">—</span>;
  return (
    <div className="flex min-w-36 items-center gap-3">
      <progress className="meter" max={100} value={pct} aria-label={label} />
      <span className="w-12 shrink-0 text-right font-bold">{pct}%</span>
    </div>
  );
}
function Body({ token, classId }: { token: string; classId: string }) {
  const report = useQuery({ queryKey: ["concepts-report", token, classId], queryFn: ({ signal }) => getConcepts(token, classId, signal), retry: false, refetchOnMount: "always" });
  const rows = [...(report.data?.concepts ?? [])].sort((a, b) => (a.masteryPct ?? 101) - (b.masteryPct ?? 101));
  const weakest = rows.find((r) => r.masteryPct !== null && r.masteryPct < 60);
  return (
    <>
      <PageHeader
        back={{ href: `/instructor/class/?id=${encodeURIComponent(classId)}`, label: "Back to class" }}
        title="Concepts"
        description="What the class has learned, topic by topic, across every module. The topics students struggle with most come first."
      />
      {report.isPending ? <div role="status" aria-label="Loading concepts" className="skeleton h-40" /> : null}
      {report.isError ? <p role="alert" className="callout callout-danger font-bold text-danger">{report.error instanceof ApiError ? report.error.message : "We couldn't load the concepts."}</p> : null}
      {report.data && rows.length === 0 ? (
        <div className="empty">
          <span className="icon-tile"><Icon name="target" className="size-6" /></span>
          <h2 className="text-lg">No test results yet</h2>
          <p className="max-w-md text-muted">Concepts appear once students take pretests and post-tests.</p>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <>
          {weakest ? (
            <p role="status" className="callout flex items-start gap-3">
              <Icon name="info" className="mt-0.5 size-5 shrink-0 text-brand" />
              <span>
                <strong>{weakest.concept}</strong> is the topic to revisit: {weakest.masteryPct}% of students who took the post-test reached 80% or more on it.
              </span>
            </p>
          ) : null}
          <p className="mt-4 text-sm text-muted">&ldquo;Mastered&rdquo; is the share of students who took the post-test and scored 80% or more on that concept.</p>
          <div className="table-wrap mt-3">
            <table className="table-brand">
              <caption className="sr-only">Mastery and learning gain for each concept</caption>
              <thead><tr><th scope="col">Concept</th><th scope="col">Mastered</th><th scope="col">Took post-test</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Gain</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.concept}>
                    <th scope="row">{c.concept} {c.lowItemCount ? <span className="badge badge-muted">few questions</span> : null}</th>
                    <td><Mastery pct={c.masteryPct} label={`${c.concept} mastered`} /></td>
                    <td>{c.postN}</td><td>{num(c.meanPre, "%")}</td><td>{num(c.meanPost, "%")}</td>
                    <td>{c.meanGain === null ? "—" : <span className={`badge ${c.meanGain > 0 ? "" : c.meanGain < 0 ? "badge-warn" : "badge-muted"}`}>{c.meanGain > 0 ? "+" : ""}{c.meanGain}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
export function ConceptsScreen() {
  const classId = useSearchParams().get("id") ?? "";
  return <StaffPage roles={TEACHER_ROLES}>{({ token }) => classId ? <Body token={token} classId={classId} /> : <p role="alert" className="callout callout-danger">No class was chosen.</p>}</StaffPage>;
}
