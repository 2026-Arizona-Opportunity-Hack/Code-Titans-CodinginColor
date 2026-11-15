"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ApiError } from "../../lib/api/client";
import { downloadExport } from "../../lib/api/exportCsv";
import { getModuleGain, getProgress, type GainSummary } from "../../lib/api/reports";
import { Icon } from "../common/Icon";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";
import { StatGrid } from "../common/StatGrid";
import { TEACHER_ROLES } from "../../lib/api/staff";

const num = (x: number | null, suffix = "") => (x === null ? "—" : `${x}${suffix}`);
const signed = (x: number | null) => (x === null ? "—" : `${x > 0 ? "+" : ""}${x}`);

function Tiles({ summary }: { summary: GainSummary }) {
  return (
    <StatGrid
      className="mt-6"
      items={[
        { label: "Students with both tests", value: summary.nEnrolled === null ? String(summary.n) : `${summary.n} of ${summary.nEnrolled}`, icon: "students" },
        { label: "Average before", value: num(summary.meanPre, "%"), icon: "target" },
        { label: "Average after", value: num(summary.meanPost, "%"), icon: "check" },
        { label: "Average gain", value: `${signed(summary.meanGain)}${summary.meanGain === null ? "" : " pts"}`, icon: "trending" },
        { label: "Normalized gain", value: num(summary.normalizedGain), icon: "chart" },
      ]}
    />
  );
}
/** A signed gain as a pill: green for an improvement, amber for a drop, grey when there is nothing to compare. */
function GainBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">—</span>;
  return <span className={`badge ${value > 0 ? "" : value < 0 ? "badge-warn" : "badge-muted"}`}>{signed(value)}</span>;
}
function GainBody({ token, classId }: { token: string; classId: string }) {
  const classHref = `/instructor/class/?id=${encodeURIComponent(classId)}`;
  const [chosen, setChosen] = useState("");
  const [exportError, setExportError] = useState("");
  const [exporting, setExporting] = useState(false);

  const progress = useQuery({ queryKey: ["progress", token, classId], queryFn: ({ signal }) => getProgress(token, classId, signal), retry: false });
  const modules = progress.data?.modules ?? [];
  const moduleId = chosen || modules[0]?.moduleId || "";

  const gain = useQuery({
    queryKey: ["gain", token, classId, moduleId],
    queryFn: ({ signal }) => getModuleGain(token, classId, moduleId, signal),
    enabled: Boolean(moduleId),
    retry: false,
    refetchOnMount: "always",
  });

  async function exportCsv() {
    setExportError("");
    setExporting(true);
    try {
      await downloadExport(token, classId, "gain");
    } catch (e) {
      setExportError(e instanceof ApiError ? e.message : "The export could not be created.");
    } finally {
      setExporting(false);
    }
  }

  const g = gain.data;
  const lowItems = g?.byConcept.filter((c) => c.lowItemCount) ?? [];

  return (
    <>
      <PageHeader
        back={{ href: classHref, label: "Back to class" }}
        title="Learning gain"
        description="How much students improved between the pretest and the post-test."
        actions={
          <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={exporting}>
            <Icon name="spreadsheet" className="size-5" />
            {exporting ? "Preparing…" : "Download CSV"}
          </button>
        }
      />
      {exportError ? (
        <p role="alert" className="callout callout-danger mt-4 font-bold text-danger">
          {exportError}
        </p>
      ) : null}

      {progress.isPending ? <div role="status" aria-label="Loading" className="skeleton mt-6 h-40" /> : null}
      {progress.isError ? (
        <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">
          {progress.error instanceof ApiError ? progress.error.message : "We couldn't load this class."}
        </p>
      ) : null}
      {progress.data && modules.length === 0 ? (
        <div className="empty">
          <span className="icon-tile"><Icon name="book" className="size-6" /></span>
          <h2 className="text-lg">No modules are assigned yet</h2>
          <Link href={`/instructor/class/assignments/?id=${encodeURIComponent(classId)}`} className="btn btn-primary mt-2">
            Assigned modules
          </Link>
        </div>
      ) : null}

      {modules.length > 0 ? (
        <div className="max-w-sm">
          <label htmlFor="gain-module" className="label">
            Module
          </label>
          <select id="gain-module" className="field mt-1" value={moduleId} onChange={(e) => setChosen(e.target.value)}>
            {modules.map((m) => (
              <option key={m.moduleId} value={m.moduleId}>
                {m.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {gain.isPending && moduleId ? <div role="status" aria-label="Loading gain" className="skeleton mt-6 h-40" /> : null}
      {gain.isError ? (
        <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">
          {gain.error instanceof ApiError ? gain.error.message : "We couldn't load the results."}
        </p>
      ) : null}

      {g ? (
        <>
          {g.class.n === 0 ? (
            <div className="empty mt-6">
              <span className="icon-tile"><Icon name="chart" className="size-6" /></span>
              <h2 className="text-lg">No gain to show yet</h2>
              <p className="max-w-md text-muted">Gain needs a pretest and a post-test from the same student. It appears as students finish both.</p>
            </div>
          ) : (
            <Tiles summary={g.class} />
          )}
          <details className="mt-4 text-sm text-muted">
            <summary className="cursor-pointer font-bold text-brand">How these numbers are worked out</summary>
            <ul className="mt-2 list-disc pl-6">
              {Object.entries(g.definitions).map(([k, v]) => (
                <li key={k}>
                  <strong>{k}</strong>: {v}
                </li>
              ))}
            </ul>
          </details>

          {g.byConcept.length > 0 ? (
            <>
              <h2 className="mt-10">By concept</h2>
              {lowItems.length > 0 ? (
                <p className="callout mt-2 text-sm">Concepts marked &ldquo;few questions&rdquo; have fewer than 3 test questions, so read them with care.</p>
              ) : null}
              <div className="table-wrap mt-3">
                <table className="table-brand">
                  <caption className="sr-only">Learning gain for each concept in this module</caption>
                  <thead>
                    <tr>
                      <th scope="col">Concept</th>
                      <th scope="col">Students</th>
                      <th scope="col">Before</th>
                      <th scope="col">After</th>
                      <th scope="col">Gain</th>
                      <th scope="col">At 80% or above</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.byConcept.map((c) => (
                      <tr key={c.concept}>
                        <th scope="row">
                          {c.concept} {c.lowItemCount ? <span className="badge badge-muted">few questions</span> : null}
                        </th>
                        <td>{c.n}</td>
                        <td>{num(c.meanPre, "%")}</td>
                        <td>{num(c.meanPost, "%")}</td>
                        <td><GainBadge value={c.meanGain} /></td>
                        <td>{num(c.masteryPct, "%")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
          <h2 className="mt-10">By student</h2>
          <div className="table-wrap mt-3">
            <table className="table-brand">
              <caption className="sr-only">Pretest and post-test score for each student</caption>
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Before</th>
                  <th scope="col">After</th>
                  <th scope="col">Gain</th>
                </tr>
              </thead>
              <tbody>
                {g.students.map((s) => (
                  <tr key={s.studentId}>
                    <th scope="row">{s.displayName}</th>
                    <td>{s.pre === null ? <span className="text-muted">Not taken</span> : `${s.pre}%`}</td>
                    <td>{s.post === null ? <span className="text-muted">Not taken</span> : `${s.post}%`}</td>
                    <td><GainBadge value={s.gain} /></td>
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

export function GainScreen() {
  const classId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={TEACHER_ROLES}>
      {({ token }) =>
        classId ? (
          <GainBody token={token} classId={classId} />
        ) : (
          <p role="alert" className="callout callout-danger">
            No class was chosen. Open this page from a class.
          </p>
        )
      }
    </StaffPage>
  );
}
