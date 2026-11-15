"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../lib/api/client";
import { createModule, deleteModule, listConcepts, listModulesFor, type ModuleSummary } from "../../lib/api/curriculum";
import type { StaffMe } from "../../lib/api/staff";
import { Icon } from "../common/Icon";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";
import { TEACHER_ROLES } from "../../lib/api/staff";
import { ConvertFileDialog } from "./ConvertFileDialog";

type Show = "all" | "published" | "draft" | "mine";
const SHOW: [Show, string][] = [["all", "All"], ["published", "Published"], ["draft", "Drafts"], ["mine", "Made by me"]];
// People who are not authors only ever see published modules, so those two filters would be empty for them.
const AUTHOR_ONLY: Show[] = ["draft", "mine"];
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
      <button type="button" className="btn btn-primary" onClick={open}>
        <Icon name="plus" className="size-5" />
        New module
      </button>
      <dialog ref={dialog} aria-labelledby="new-module-h" className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-hairline bg-surface p-7 shadow-[var(--shadow-lg)] backdrop:bg-black/40 backdrop:backdrop-blur-[2px]">
        <form onSubmit={submit}>
          <h2 id="new-module-h" className="text-xl">New module</h2>
          <label htmlFor="new-title" className="label mt-4">Title</label>
          <p id="new-title-h" className="text-sm text-muted">It starts with a pretest, video, check, worksheet, exit question and post-test for you to fill in.</p>
          <input id="new-title" className="field mt-1" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} aria-describedby="new-title-h" autoComplete="off" autoFocus />
          {create.isError ? <p role="alert" className="mt-2 font-bold text-danger">{errorText(create.error, "The module could not be created.")}</p> : null}
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={!title.trim() || create.isPending}>{create.isPending ? "Creating…" : "Create and edit"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function StatusBadge({ m }: { m: ModuleSummary }) {
  if (m.latestVersion === 0) return <span className="badge badge-muted badge-dot">Draft</span>;
  if (m.hasUnpublishedChanges) return <span className="badge badge-warn badge-dot">v{m.latestVersion} · unpublished changes</span>;
  return <span className="badge badge-dot">Published v{m.latestVersion}</span>;
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
    return <button type="button" className="btn btn-sm btn-ghost ml-auto !px-2.5 !text-danger hover:!bg-[color-mix(in_srgb,var(--danger)_8%,white)]" title="Delete" onClick={() => setConfirming(true)}><Icon name="trash" className="size-4" /><span className="sr-only">Delete {m.title}</span></button>;
  }
  return (
    <div role="group" aria-label={`Delete ${m.title}?`} className="callout callout-danger mt-3 w-full">
      <p className="text-sm font-bold">Delete &ldquo;{m.title}&rdquo;{m.latestVersion > 0 ? ` and all ${m.latestVersion} published version${m.latestVersion === 1 ? "" : "s"}` : ""}? This can&apos;t be undone.</p>
      <div className="mt-2 flex gap-2">
        <button type="button" className="btn btn-sm btn-primary !bg-danger" disabled={remove.isPending} onClick={() => remove.mutate()} autoFocus>{remove.isPending ? "Deleting…" : "Yes, delete"}</button>
        <button type="button" className="btn btn-sm btn-secondary" disabled={remove.isPending} onClick={() => { setConfirming(false); remove.reset(); }}>Cancel</button>
      </div>
      {remove.isError ? <p role="alert" className="mt-2 text-sm font-bold text-danger">{errorText(remove.error, "The module could not be deleted.")}</p> : null}
    </div>
  );
}

function ModuleCard({ token, me, m }: { token: string; me: StaffMe; m: ModuleSummary }) {
  const author = me.permissions.canAuthor;
  const canEdit = author && m.canEdit !== false;
  const canDelete = author && (me.role === "cic_admin" || m.createdBy === me.userId);
  const mine = m.createdBy === me.userId;
  return (
    <li className="card card-interactive flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="icon-tile">
          <Icon name="book" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="!text-lg">{m.title}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {mine ? "Made by you" : "Shared curriculum"}
            {m.estimatedMinutes ? ` · about ${m.estimatedMinutes} min` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge m={m} />
        {m.concepts.map((c) => (
          <span key={c} className="badge badge-muted">
            {c}
          </span>
        ))}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        {m.latestVersion > 0 ? (
          <Link href={viewHref(m.moduleId)} className="btn btn-sm btn-secondary">
            <Icon name="eye" className="size-4" />
            View<span className="sr-only"> {m.title}</span>
          </Link>
        ) : null}
        {canEdit ? (
          <Link href={editHref(m.moduleId)} className={`btn btn-sm ${m.latestVersion > 0 ? "btn-secondary" : "btn-primary"}`}>
            <Icon name="pencil" className="size-4" />
            {m.latestVersion > 0 ? "Edit" : "Continue editing"}
            <span className="sr-only"> {m.title}</span>
          </Link>
        ) : null}
        {canDelete ? <DeleteButton token={token} m={m} /> : null}
      </div>
    </li>
  );
}

function Body({ token, me }: { token: string; me: StaffMe }) {
  const [show, setShow] = useState<Show>("all");
  const [text, setText] = useState("");
  const [concept, setConcept] = useState("");
  const modules = useQuery({ queryKey: ["author-modules", token], queryFn: ({ signal }) => listModulesFor(token, me.permissions.canAuthor ? "all" : "published", signal), retry: false, refetchOnMount: "always" });
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
      <PageHeader
        title="Curriculum"
        description={
          me.permissions.canAuthor
            ? "Browse every module, create new ones, and update any of them. Published versions never change, so students never lose their place."
            : "Browse the published modules and assign them to your classes. Only curriculum authors change modules."
        }
        actions={me.permissions.canAuthor ? <div className="flex flex-wrap gap-2"><ConvertFileDialog token={token} /><NewModuleDialog token={token} /></div> : undefined}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <label htmlFor="mod-search" className="sr-only">Search</label>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input id="mod-search" type="search" className="field pl-10" placeholder="Search by title or concept" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
        </div>
        {concepts.data && concepts.data.length > 0 ? (
          <div>
            <label htmlFor="mod-concept" className="sr-only">Concept</label>
            <select id="mod-concept" className="field" value={concept} onChange={(e) => setConcept(e.target.value)}>
              <option value="">Any concept</option>
              {concepts.data.map((c) => <option key={c.concept} value={c.concept}>{c.concept}</option>)}
            </select>
          </div>
        ) : null}
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2 sm:ml-auto">
          {SHOW.filter(([value]) => me.permissions.canAuthor || !AUTHOR_ONLY.includes(value)).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={show === value} onClick={() => setShow(value)} className="chip">
              {label}
            </button>
          ))}
        </div>
      </div>
      {modules.isPending ? (
        <div role="status" aria-label="Loading modules" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          <div className="skeleton h-44" />
          <div className="skeleton h-44" />
          <div className="skeleton h-44" />
        </div>
      ) : null}
      {modules.isError ? <p role="alert" className="callout callout-danger font-bold text-danger">{errorText(modules.error, "We couldn't load the modules.")}</p> : null}
      <p aria-live="polite" className="sr-only">{modules.data ? `${shown.length} module${shown.length === 1 ? "" : "s"} shown` : ""}</p>

      {modules.data && modules.data.length === 0 ? (
        <div className="empty">
          <span className="icon-tile"><Icon name="book" className="size-6" /></span>
          <h2 className="text-lg">No modules yet</h2>
          <p className="max-w-md text-muted">Create the first one with the New module button. It comes with every step a lesson needs.</p>
        </div>
      ) : null}
      {modules.data && modules.data.length > 0 && shown.length === 0 ? (
        <div className="empty">
          <p className="font-bold">No modules match.</p>
          {filtered ? <button type="button" className="btn btn-secondary mt-1" onClick={clear}>Clear filters</button> : null}
        </div>
      ) : null}

      <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((m) => <ModuleCard key={m.moduleId} token={token} me={me} m={m} />)}
      </ul>
    </>
  );
}

/** One place for curriculum: browse, create, edit, publish and delete. For admins and instructors. */
export function CurriculumScreen() {
  return <StaffPage roles={TEACHER_ROLES}>{({ token, me }) => <Body token={token} me={me} />}</StaffPage>;
}
