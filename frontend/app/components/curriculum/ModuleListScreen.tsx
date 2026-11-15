"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ApiError } from "../../lib/api/client";
import { listConcepts, listModules } from "../../lib/api/curriculum";
import type { StaffRole } from "../../lib/api/staff";
import { StaffPage } from "../common/StaffPage";

/** Read-only browser of published modules, for instructors (before assigning) and reviewers. */
function Body({ token, base }: { token: string; base: string }) {
  const [concept, setConcept] = useState("");
  const modules = useQuery({ queryKey: ["modules", token], queryFn: ({ signal }) => listModules(token, signal), retry: false });
  const concepts = useQuery({ queryKey: ["concepts", token], queryFn: ({ signal }) => listConcepts(token, signal), retry: false });
  const shown = (modules.data ?? []).filter((m) => !concept || m.concepts.includes(concept));

  return (
    <>
      <h1>Curriculum</h1>
      <p className="mt-1 text-muted">Published modules. Open one to see every activity and its answers.</p>

      {concepts.data && concepts.data.length > 0 ? (
        <div className="mt-6 max-w-sm">
          <label htmlFor="concept" className="block font-bold">Show modules that teach</label>
          <select id="concept" className="field mt-1" value={concept} onChange={(e) => setConcept(e.target.value)}>
            <option value="">Everything</option>
            {concepts.data.map((c) => <option key={c.concept} value={c.concept}>{c.concept} ({c.moduleCount})</option>)}
          </select>
        </div>
      ) : null}

      {modules.isPending ? <div role="status" aria-label="Loading modules" className="skeleton mt-6 h-40" /> : null}
      {modules.isError ? <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">{modules.error instanceof ApiError ? modules.error.message : "We couldn't load the modules."}</p> : null}
      {modules.data && shown.length === 0 ? <p className="card mt-6 max-w-xl text-muted">No modules to show.</p> : null}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {shown.map((m) => (
          <li key={m.moduleId} className="card">
            <h2 className="text-lg">{m.title}</h2>
            <p className="mt-1 text-sm text-muted">
              Version {m.latestVersion}{m.estimatedMinutes ? ` · about ${m.estimatedMinutes} minutes` : ""}
            </p>
            <p className="mt-2 flex flex-wrap gap-2">{m.concepts.map((c) => <span key={c} className="badge">{c}</span>)}</p>
            <Link href={`${base}/module/?id=${encodeURIComponent(m.moduleId)}`} className="btn btn-secondary mt-4">
              View<span className="sr-only"> {m.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ModuleListScreen({ base, roles }: { base: string; roles: StaffRole[] }) {
  return <StaffPage roles={roles}>{({ token }) => <Body token={token} base={base} />}</StaffPage>;
}
