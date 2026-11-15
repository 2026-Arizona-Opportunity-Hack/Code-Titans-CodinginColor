"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { getCohortSummary, listCohorts, updateCohort, type CohortSummary } from "../../lib/api/admin";
import { ApiError } from "../../lib/api/client";
import { listClasses } from "../../lib/api/staff";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";

const num = (x: number | null, s = "") => (x === null ? "—" : `${x}${s}`);
const msg = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);

function Summary({ s }: { s: CohortSummary }) {
  const tiles: [string, string][] = [
    ["Students", String(s.enrolled)], ["Classes", String(s.classes)],
    ["Activities completed", num(s.completion.completionPct, "%")], ["Average gain", s.learningGain.meanGain === null ? "—" : `${s.learningGain.meanGain > 0 ? "+" : ""}${s.learningGain.meanGain} points`],
  ];
  return (
    <>
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map(([l, v]) => <div key={l} className="card"><dt className="text-sm text-muted">{l}</dt><dd className="mt-1 text-2xl font-bold text-brand">{v}</dd></div>)}
      </dl>
      <p className="mt-2 text-sm text-muted">Gain counts the {s.learningGain.n} of {s.learningGain.nEnrolled} students who took both tests.</p>
      <h3 className="mt-6 text-lg font-bold">By class</h3>
      <div className="table-wrap mt-2"><table className="table-brand">
        <caption className="sr-only">Completion and gain for each class in the cohort</caption>
        <thead><tr><th scope="col">Class</th><th scope="col">Students</th><th scope="col">Completed</th><th scope="col">Both tests</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Gain</th></tr></thead>
        <tbody>{s.byClass.map((c) => <tr key={c.classId}><th scope="row">{c.name}</th><td>{c.enrolled}</td><td>{num(c.completionPct, "%")}</td><td>{c.n}</td><td>{num(c.meanPre, "%")}</td><td>{num(c.meanPost, "%")}</td><td>{num(c.meanGain)}</td></tr>)}</tbody>
      </table></div>
      <h3 className="mt-6 text-lg font-bold">By module</h3>
      <div className="table-wrap mt-2"><table className="table-brand">
        <caption className="sr-only">Gain for each module across the cohort</caption>
        <thead><tr><th scope="col">Module</th><th scope="col">Both tests</th><th scope="col">Before</th><th scope="col">After</th><th scope="col">Gain</th></tr></thead>
        <tbody>{s.byModule.map((m) => <tr key={m.moduleId}><th scope="row">{m.title}</th><td>{m.n}</td><td>{num(m.meanPre, "%")}</td><td>{num(m.meanPost, "%")}</td><td>{num(m.meanGain)}</td></tr>)}</tbody>
      </table></div>
    </>
  );
}

function Body({ token, cohortId }: { token: string; cohortId: string }) {
  const qc = useQueryClient();
  const cohorts = useQuery({ queryKey: ["cohorts", token], queryFn: ({ signal }) => listCohorts(token, signal), retry: false });
  const classes = useQuery({ queryKey: ["all-classes", token], queryFn: ({ signal }) => listClasses(token, signal), retry: false, refetchOnMount: "always" });
  const summary = useQuery({ queryKey: ["cohort-summary", token, cohortId], queryFn: ({ signal }) => getCohortSummary(token, cohortId, signal), retry: false, refetchOnMount: "always" });
  const cohort = cohorts.data?.find((c) => c.cohortId === cohortId);
  const [name, setName] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const members = new Set((classes.data ?? []).filter((c) => c.cohortId === cohortId).map((c) => c.classId));
  const chosen = picked ?? members;

  const save = useMutation({
    mutationFn: (body: Parameters<typeof updateCohort>[2]) => updateCohort(token, cohortId, body),
    onSuccess: () => { setPicked(null); setName(null); for (const k of ["cohorts", "all-classes", "cohort-summary"]) qc.invalidateQueries({ queryKey: [k, token] }); },
  });

  if (cohorts.isPending) return <div role="status" aria-label="Loading cohort" className="skeleton h-40" />;
  if (!cohort) return <p role="alert" className="callout callout-danger font-bold text-danger">{cohorts.isError ? msg(cohorts.error, "We couldn't load this cohort.") : "Cohort not found."}</p>;
  const toggle = (id: string) => setPicked(() => { const next = new Set(chosen); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const archived = cohort.status === "archived";

  return (
    <>
      <PageHeader back={{ href: "/admin/cohorts/", label: "Back to cohorts" }} title={cohort.name} />

      <div className="card mt-6 max-w-xl">
        <label htmlFor="coh-rename" className="block font-bold">Name</label>
        <input id="coh-rename" className="field mt-1" value={name ?? cohort.name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className="btn btn-secondary" disabled={save.isPending || !(name ?? "").trim() || name === cohort.name} onClick={() => save.mutate({ name: (name ?? "").trim() })}>Save name</button>
          <button type="button" className="btn btn-secondary" disabled={save.isPending} onClick={() => save.mutate({ status: archived ? "active" : "archived" })}>{archived ? "Restore cohort" : "Archive cohort"}</button>
        </div>
      </div>

      <fieldset className="card mt-6 max-w-xl">
        <legend className="px-1 text-lg font-bold">Classes in this cohort</legend>
        <p className="text-sm text-muted">A class can be in one cohort. Adding it here moves it out of any other.</p>
        {classes.data?.map((c) => (
          <label key={c.classId} className="mt-2 flex items-center gap-2">
            <input type="checkbox" className="size-5" checked={chosen.has(c.classId)} onChange={() => toggle(c.classId)} />
            {c.name}{c.cohortId && c.cohortId !== cohortId ? <span className="text-sm text-muted"> (in another cohort)</span> : null}
          </label>
        ))}
        <button type="button" className="btn btn-primary mt-4" disabled={save.isPending || picked === null} onClick={() => save.mutate({ classIds: [...chosen] })}>{save.isPending ? "Saving…" : "Save classes"}</button>
      </fieldset>
      {save.isError ? <p role="alert" className="callout callout-danger mt-4 font-bold text-danger">{msg(save.error, "Could not save.")}</p> : null}

      <h2 className="mt-8">Results</h2>
      {summary.isPending ? <div role="status" aria-label="Loading results" className="skeleton mt-3 h-32" /> : null}
      {summary.isError ? <p role="alert" className="callout callout-danger mt-3 font-bold text-danger">{msg(summary.error, "We couldn't load the results.")}</p> : null}
      {summary.data && summary.data.classes === 0 ? <p className="card mt-3 text-muted">Add a class to see results.</p> : null}
      {summary.data && summary.data.classes > 0 ? <Summary s={summary.data} /> : null}
    </>
  );
}

export function CohortDetailScreen() {
  const id = useSearchParams().get("id") ?? "";
  return <StaffPage roles={["cic_admin"]}>{({ token }) => id ? <Body token={token} cohortId={id} /> : <p role="alert" className="callout callout-danger">No cohort was chosen.</p>}</StaffPage>;
}
