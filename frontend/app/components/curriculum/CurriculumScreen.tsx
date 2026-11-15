"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../lib/api/client";
import { createModule, deleteModule, listConcepts, listModulesFor, type ModuleSummary } from "../../lib/api/curriculum";
import type { StaffMe } from "../../lib/api/staff";
import { StaffPage } from "../common/StaffPage";

type Show = "all" | "published" | "draft" | "mine";
const SHOW: [Show, string][] = [["all", "All"], ["published", "Published"], ["draft", "Drafts"], ["mine", "Made by me"]];
const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);
const editHref = (id: string) => `/author/edit/?id=${encodeURIComponent(id)}`;
const viewHref = (id: string) => `/instructor/curriculum/module/?id=${encodeURIComponent(id)}`;

/** "New module" as a dialog, so the page stays a list until someone wants to create. */
function NewModuleDialog({ token }: { token: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const create = useMutation({
    mutationFn: () => createModule(token, { title: title.trim(), template: "standard" }),
    onSuccess: (doc) => {
      qc.invalidateQueries({ queryKey: ["author-modules", token] });
      router.push(editHref(doc.moduleId));
    },
  });
  const open = () => { setTitle(""); create.reset(); dialog.current?.showModal(); };
  const submit = (e: FormEvent) => { e.preventDefault(); if (title.trim()) create.mutate(); };
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={open}>New module</button>
      <dialog ref={dialog} aria-labelledby="new-module-h" className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-line p-6 shadow-xl backdrop:bg-black/40">
        <form onSubmit={submit}>
          <h2 id="new-module-h" className="text-xl">New module</h2>
          <label htmlFor="new-title" className="mt-4 block font-bold">Title</label>
          <p id="new-title-h" className="text-sm text-muted">It starts with a pretest, video, check, worksheet, exit question and post-test for you to fill in.</p>
          <input id="new-title" className="field mt-1" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} aria-describedby="new-title-h" autoComplete="off" autoFocus />
          {create.isError ? <p role="alert" className="mt-2 font-bold text-danger">{errorText(create.error, "The module could not be created.")}</p> : null}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!title.trim() || create.isPending}>{create.isPending ? "Creating…" : "Create and edit"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function StatusBadge({ m }: { m: ModuleSummary }) {
  if (m.latestVersion === 0) return <span className="badge badge-muted">Draft</span>;
  if (m.hasUnpublishedChanges) return <span className="badge badge-warn">Published v{m.latestVersion} · unpublished changes</span>;
  return <span className="badge">Published v{m.latestVersion}</span>;
}

/** Delete with an inline confirm step. Shown only to the module's creator and to admins (the API checks too). */
function DeleteButton({ token, m }: { token: string; m: ModuleSummary }) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteModule(token, m.moduleId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["author-modules", token] }); qc.invalidateQueries({ queryKey: ["modules", token] }); },
  });
  if (!confirming) {
    return <button type="button" className="ml-auto text-sm font-bold text-danger underline underline-offset-2 min-h-11 px-1" onClick={() => setConfirming(true)}>Delete<span className="sr-only"> {m.title}</span></button>;
  }
  return (
    <div role="group" aria-label={`Delete ${m.title}?`} className="mt-3 w-full rounded-lg border border-danger p-3">
      <p className="text-sm font-bold">Delete &ldquo;{m.title}&rdquo;{m.latestVersion > 0 ? ` and all ${m.latestVersion} published version${m.latestVersion === 1 ? "" : "s"}` : ""}? This can&apos;t be undone.</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className="btn btn-primary" disabled={remove.isPending} onClick={() => remove.mutate()} autoFocus>{remove.isPending ? "Deleting…" : "Yes, delete"}</button>
        <button type="button" className="btn btn-secondary" disabled={remove.isPending} onClick={() => { setConfirming(false); remove.reset(); }}>Cancel</button>
      </div>
      {remove.isError ? <p role="alert" className="mt-2 text-sm font-bold text-danger">{errorText(remove.error, "The module could not be deleted.")}</p> : null}
    </div>
  );
}

function ModuleCard({ token, me, m }: { token: string; me: StaffMe; m: ModuleSummary }) {
  const canEdit = m.canEdit !== false;
  const canDelete = me.role === "cic_admin" || m.createdBy === me.userId;
  const mine = m.createdBy === me.userId;
  return (
    <li className="card flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg">{m.title}</h2>
        <StatusBadge m={m} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {mine ? "Made by you" : "Shared curriculum"}
        {m.estimatedMinutes ? ` · about ${m.estimatedMinutes} min` : ""}
      </p>
      {m.concepts.length > 0 ? <p className="mt-3 flex flex-wrap gap-2">{m.concepts.map((c) => <span key={c} className="badge badge-muted">{c}</span>)}</p> : null}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {m.latestVersion > 0 ? <Link href={viewHref(m.moduleId)} className="btn btn-secondary">View<span className="sr-only"> {m.title}</span></Link> : null}
        {canEdit ? <Link href={editHref(m.moduleId)} className={m.latestVersion > 0 ? "btn btn-secondary" : "btn btn-primary"}>{m.latestVersion > 0 ? "Edit" : "Continue editing"}<span className="sr-only"> {m.title}</span></Link> : null}
        {canDelete ? <DeleteButton token={token} m={m} /> : null}
      </div>
    </li>
  );
}

function Body({ token, me }: { token: string; me: StaffMe }) {
  const [show, setShow] = useState<Show>("all");
  const [text, setText] = useState("");
  const [concept, setConcept] = useState("");
  const modules = useQuery({ queryKey: ["author-modules", token], queryFn: ({ signal }) => listModulesFor(token, "all", signal), retry: false, refetchOnMount: "always" });
  const concepts = useQuery({ queryKey: ["concepts", token], queryFn: ({ signal }) => listConcepts(token, signal), retry: false });
  const needle = text.trim().toLowerCase();
  const shown = useMemo(() => (modules.data ?? [])
    .filter((m) => show === "all" || (show === "published" ? m.latestVersion > 0 : show === "draft" ? m.latestVersion === 0 : m.createdBy === me.userId))
    .filter((m) => !needle || m.title.toLowerCase().includes(needle) || m.concepts.some((c) => c.includes(needle)))
    .filter((m) => !concept || m.concepts.includes(concept)), [modules.data, show, needle, concept, me.userId]);
  const filtered = show !== "all" || Boolean(needle) || Boolean(concept);
  const clear = () => { setShow("all"); setText(""); setConcept(""); };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Curriculum</h1>
          <p className="mt-1 max-w-prose text-muted">
            Browse modules, or create your own. You can edit the modules you made{me.permissions.canEditAll ? " and everyone else's" : ""}. Published versions never change, so students never lose their place.
          </p>
        </div>
        <NewModuleDialog token={token} />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div className="min-w-56 flex-1 sm:max-w-sm">
          <label htmlFor="mod-search" className="block font-bold">Search</label>
          <input id="mod-search" type="search" className="field mt-1" placeholder="Title or concept" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </div>
        {concepts.data && concepts.data.length > 0 ? (
          <div>
            <label htmlFor="mod-concept" className="block font-bold">Concept</label>
            <select id="mod-concept" className="field mt-1" value={concept} onChange={(e) => setConcept(e.target.value)}>
              <option value="">Any concept</option>
              {concepts.data.map((c) => <option key={c.concept} value={c.concept}>{c.concept}</option>)}
            </select>
          </div>
        ) : null}
      </div>
      <div role="group" aria-label="Show" className="mt-4 flex flex-wrap gap-2">
        {SHOW.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={show === value} onClick={() => setShow(value)}
            className={`min-h-11 rounded-full border px-4 text-sm font-bold ${show === value ? "border-brand bg-brand text-on-brand" : "border-line bg-surface text-ink hover:border-brand"}`}>
            {label}
          </button>
        ))}
      </div>

      {modules.isPending ? <div role="status" aria-label="Loading modules" className="skeleton mt-6 h-40" /> : null}
      {modules.isError ? <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">{errorText(modules.error, "We couldn't load the modules.")}</p> : null}
      <p aria-live="polite" className="sr-only">{modules.data ? `${shown.length} module${shown.length === 1 ? "" : "s"} shown` : ""}</p>

      {modules.data && modules.data.length === 0 ? (
        <div className="card mt-6 max-w-xl">
          <h2 className="text-lg">No modules yet</h2>
          <p className="mt-1 text-muted">Create the first one with the New module button. It comes with every step a lesson needs.</p>
        </div>
      ) : null}
      {modules.data && modules.data.length > 0 && shown.length === 0 ? (
        <div className="card mt-6 max-w-xl">
          <p className="text-muted">No modules match.</p>
          {filtered ? <button type="button" className="btn btn-secondary mt-3" onClick={clear}>Clear filters</button> : null}
        </div>
      ) : null}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((m) => <ModuleCard key={m.moduleId} token={token} me={me} m={m} />)}
      </ul>
    </>
  );
}

/** One place for curriculum: browse, create, edit, publish and delete. For admins and instructors. */
export function CurriculumScreen() {
  return <StaffPage roles={["instructor", "cic_admin"]}>{({ token, me }) => <Body token={token} me={me} />}</StaffPage>;
}
