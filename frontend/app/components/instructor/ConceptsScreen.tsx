"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "../../lib/api/client";
import { getConcepts } from "../../lib/api/reports";
import { StaffPage } from "../common/StaffPage";

const num = (x: number | null, s = "") => (x === null ? "—" : `${x}${s}`);

function Body({ token, classId }: { token: string; classId: string }) {
  const report = useQuery({ queryKey: ["concepts-report", token, classId], queryFn: ({ signal }) => getConcepts(token, classId, signal), retry: false, refetchOnMount: "always" });
  const rows = [...(report.data?.concepts ?? [])].sort((a, b) => (a.masteryPct ?? 101) - (b.masteryPct ?? 101));
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm"><Link href={`/instructor/class/?id=${encodeURIComponent(classId)}`}>← Back to class</Link></nav>
      <h1>Concepts</h1>
      <p className="mt-1 text-muted">What the class has learned, topic by topic, across every module. The topics students struggle with most come first.</p>
      {report.isPending ? <div role="status" aria-label="Loading concepts" className="skeleton mt-6 h-40" /> : null}
      {report.isError ? <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">{report.error instanceof ApiError ? report.error.message : "We couldn't load the concepts."}</p> : null}
      {report.data && rows.length === 0 ? <p className="card mt-6 max-w-xl text-muted">No test results yet. Concepts appear once students take pretests and post-tests.</p> : null}
      {rows.length > 0 ? (
        <>
          <p className="mt-4 text-sm text-muted">&ldquo;Mastered&rdquo; is the share of students who took the post-test and scored 80% or more on that concept.</p>
          <div className="table-wrap mt-3">
            <table className="table-brand">
              <caption className="sr-only">Mastery and learning gain for each concept</caption>
              <thead><tr><th scope="col">Concept</th><th scope="col">Mastered</th><th scope="col">Took post-test</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Gain</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.concept}>
                    <th scope="row">{c.concept} {c.lowItemCount ? <span className="badge badge-muted">few questions</span> : null}</th>
                    <td>{num(c.masteryPct, "%")}</td><td>{c.postN}</td><td>{num(c.meanPre, "%")}</td><td>{num(c.meanPost, "%")}</td>
                    <td>{c.meanGain === null ? "—" : `${c.meanGain > 0 ? "+" : ""}${c.meanGain}`}</td>
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
  return <StaffPage roles={["instructor", "cic_admin"]}>{({ token }) => classId ? <Body token={token} classId={classId} /> : <p role="alert" className="callout callout-danger">No class was chosen.</p>}</StaffPage>;
}
