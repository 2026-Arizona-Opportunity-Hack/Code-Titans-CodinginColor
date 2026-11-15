"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { createSchool, listSchools, updateSchool, type School } from "../../lib/api/admin";
import { ApiError } from "../../lib/api/client";
import { StaffPage } from "../common/StaffPage";

const msg = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
function SchoolRow({ token, school }: { token: string; school: School }) {
  const qc = useQueryClient();
  const [name, setName] = useState(school.name);
  const save = useMutation({
    mutationFn: (body: Parameters<typeof updateSchool>[2]) => updateSchool(token, school.orgId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schools", token] }),
  });
  const archived = school.status === "archived";
  return (
    <tr>
      <th scope="row">
        <label htmlFor={`school-${school.orgId}`} className="sr-only">School name</label>
        <input id={`school-${school.orgId}`} className="field max-w-sm" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </th>
      <td>{archived ? <span className="badge badge-muted">Archived</span> : <span className="badge">Active</span>}</td>
      <td className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" disabled={save.isPending || !name.trim() || name.trim() === school.name} onClick={() => save.mutate({ name: name.trim() })}>Save name<span className="sr-only"> for {school.name}</span></button>
        <button type="button" className="btn btn-secondary" disabled={save.isPending} onClick={() => save.mutate({ status: archived ? "active" : "archived" })}>{archived ? "Restore" : "Archive"}<span className="sr-only"> {school.name}</span></button>
        {save.isError ? <p role="alert" className="w-full text-sm font-bold text-danger">{msg(save.error, "Could not save.")}</p> : null}
      </td>
    </tr>
  );
}

function Body({ token }: { token: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const schools = useQuery({ queryKey: ["schools", token], queryFn: ({ signal }) => listSchools(token, signal), retry: false, refetchOnMount: "always" });
  const create = useMutation({
    mutationFn: () => createSchool(token, name.trim()),
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: ["schools", token] }); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (name.trim()) create.mutate(); };
  return (
    <>
      <h1>Schools</h1>
      <p className="mt-1 text-muted">Partner schools. Every class belongs to one.</p>
      <form onSubmit={submit} className="card mt-6 max-w-xl">
        <label htmlFor="school-new" className="block font-bold">Add a school</label>
        <input id="school-new" className="field mt-1" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        {create.isError ? <p role="alert" className="mt-2 font-bold text-danger">{msg(create.error, "The school could not be added.")}</p> : null}
        <button type="submit" className="btn btn-primary mt-4" disabled={!name.trim() || create.isPending}>{create.isPending ? "Adding…" : "Add school"}</button>
      </form>
      {schools.isPending ? <div role="status" aria-label="Loading schools" className="skeleton mt-6 h-32" /> : null}
      {schools.isError ? <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">{msg(schools.error, "We couldn't load the schools.")}</p> : null}
      {schools.data ? (
        <div className="table-wrap mt-6">
          <table className="table-brand">
            <caption className="sr-only">Partner schools</caption>
            <thead><tr><th scope="col">Name</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{schools.data.map((s) => <SchoolRow key={s.orgId} token={token} school={s} />)}</tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

export function SchoolsScreen() {
  return <StaffPage roles={["cic_admin"]}>{({ token }) => <Body token={token} />}</StaffPage>;
}
