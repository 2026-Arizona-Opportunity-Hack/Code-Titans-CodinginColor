"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createCohort, listCohorts, listSchools } from "../../lib/api/admin";
import { ApiError } from "../../lib/api/client";
import { StaffPage } from "../common/StaffPage";

function Body({ token }: { token: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [orgId, setOrgId] = useState("");
  const cohorts = useQuery({ queryKey: ["cohorts", token], queryFn: ({ signal }) => listCohorts(token, signal), retry: false, refetchOnMount: "always" });
  const schools = useQuery({ queryKey: ["schools", token], queryFn: ({ signal }) => listSchools(token, signal), retry: false });
  const create = useMutation({
    mutationFn: () => createCohort(token, { name: name.trim(), ...(orgId ? { orgId } : {}) }),
    onSuccess: () => { setName(""); setOrgId(""); qc.invalidateQueries({ queryKey: ["cohorts", token] }); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (name.trim()) create.mutate(); };
  const schoolName = (id?: string) => schools.data?.find((s) => s.orgId === id)?.name;
  return (
    <>
      <h1>Cohorts</h1>
      <p className="mt-1 text-muted">A cohort groups classes so you can see completion and learning gain across them.</p>
      <form onSubmit={submit} className="card mt-6 max-w-xl">
        <label htmlFor="cohort-name" className="block font-bold">New cohort name</label>
        <input id="cohort-name" className="field mt-1" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <label htmlFor="cohort-school" className="mt-3 block font-bold">School (optional)</label>
        <select id="cohort-school" className="field mt-1" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          <option value="">Not tied to one school</option>
          {schools.data?.filter((s) => s.status === "active").map((s) => <option key={s.orgId} value={s.orgId}>{s.name}</option>)}
        </select>
        {create.isError ? <p role="alert" className="mt-2 font-bold text-danger">{create.error instanceof ApiError ? create.error.message : "The cohort could not be created."}</p> : null}
        <button type="submit" className="btn btn-primary mt-4" disabled={!name.trim() || create.isPending}>{create.isPending ? "Creating…" : "Create cohort"}</button>
      </form>

      {cohorts.isPending ? <div role="status" aria-label="Loading cohorts" className="skeleton mt-6 h-32" /> : null}
      {cohorts.isError ? <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">{cohorts.error instanceof ApiError ? cohorts.error.message : "We couldn't load the cohorts."}</p> : null}
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {cohorts.data?.map((c) => (
          <li key={c.cohortId} className="card">
            <h2 className="text-lg">{c.name}</h2>
            <p className="text-sm text-muted">{schoolName(c.orgId) ?? "No school"} · {c.status === "archived" ? "Archived" : "Active"}</p>
            <Link href={`/admin/cohorts/detail/?id=${encodeURIComponent(c.cohortId)}`} className="btn btn-secondary mt-3">Open<span className="sr-only"> {c.name}</span></Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function CohortsScreen() {
  return <StaffPage roles={["cic_admin"]}>{({ token }) => <Body token={token} />}</StaffPage>;
}
