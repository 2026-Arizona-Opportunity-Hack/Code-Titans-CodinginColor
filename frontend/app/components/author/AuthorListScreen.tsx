"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError } from "../../lib/api/client";
import { createModule, listModulesFor } from "../../lib/api/curriculum";
import { StaffPage } from "../common/StaffPage";

function Body({ token }: { token: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const modules = useQuery({ queryKey: ["author-modules", token], queryFn: ({ signal }) => listModulesFor(token, "all", signal), retry: false, refetchOnMount: "always" });
  const create = useMutation({
    mutationFn: () => createModule(token, { title: title.trim(), template: "standard" }),
    onSuccess: (doc) => { qc.invalidateQueries({ queryKey: ["author-modules", token] }); router.push(`/author/edit/?id=${encodeURIComponent(doc.moduleId)}`); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (title.trim()) create.mutate(); };

  return (
    <>
      <h1>Author modules</h1>
      <p className="mt-1 text-muted">Draft, edit and publish curriculum. Published versions never change, so students never lose their place.</p>

      <form onSubmit={submit} className="card mt-6 max-w-xl">
        <h2 className="text-lg">New module</h2>
        <label htmlFor="new-title" className="mt-3 block font-bold">Title</label>
        <p id="new-title-h" className="text-sm text-muted">It starts with a pretest, video, check, worksheet, exit question and post-test for you to fill in.</p>
        <input id="new-title" className="field mt-1" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} aria-describedby="new-title-h" autoComplete="off" />
        {create.isError ? <p role="alert" className="mt-2 font-bold text-danger">{create.error instanceof ApiError ? create.error.message : "The module could not be created."}</p> : null}
        <button type="submit" className="btn btn-primary mt-4" disabled={!title.trim() || create.isPending}>{create.isPending ? "Creating…" : "Create module"}</button>
      </form>

      <h2 className="mt-8">All modules</h2>
      {modules.isPending ? <div role="status" aria-label="Loading modules" className="skeleton mt-3 h-32" /> : null}
      {modules.isError ? <p role="alert" className="callout callout-danger mt-3 font-bold text-danger">{modules.error instanceof ApiError ? modules.error.message : "We couldn't load the modules."}</p> : null}
      {modules.data?.length === 0 ? <p className="card mt-3 text-muted">No modules yet.</p> : null}
      <ul className="mt-3 grid gap-3">
        {modules.data?.map((m) => (
          <li key={m.moduleId} className="card flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">{m.title}</h3>
              <p className="text-sm text-muted">
                {m.latestVersion > 0 ? `Published version ${m.latestVersion}` : "Draft, never published"}
                {m.hasUnpublishedChanges && m.latestVersion > 0 ? " · has unpublished changes" : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <span className="badge">{m.status === "draft" ? "Draft" : "Published"}</span>
              <Link href={`/author/edit/?id=${encodeURIComponent(m.moduleId)}`} className="btn btn-secondary">Edit<span className="sr-only"> {m.title}</span></Link>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function AuthorListScreen() {
  return (
    <StaffPage roles={["cic_admin", "instructor"]}>
      {({ token, me }) => me.permissions.canAuthor ? <Body token={token} /> : <p role="alert" className="callout callout-danger">You don&apos;t have permission to edit curriculum. Ask a CIC admin to turn it on.</p>}
    </StaffPage>
  );
}
