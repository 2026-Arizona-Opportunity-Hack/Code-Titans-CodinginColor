"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "../../lib/api/client";
import { getModuleDoc, listConcepts, listVersions, problemsOf, publishModule, saveDraft, type DocActivity, type ModuleDoc, type Problem } from "../../lib/api/curriculum";
import { Icon } from "../common/Icon";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";
import { ACTIVITY_ICON, ActivityEditor, newQuestion } from "./ActivityEditor";
import { ModuleClassesPanel } from "./ModuleClassesPanel";

const ADDABLE: [DocActivity["type"], string][] = [["video", "Video"], ["slides", "Slides (PDF, PowerPoint or Google Slides)"], ["check", "Check"], ["worksheet", "Worksheet"], ["exit", "Exit question"]];

function Editor({ token, moduleId, initial, onReload }: { token: string; moduleId: string; initial: ModuleDoc; onReload: () => void }) {
  const qc = useQueryClient();
  const concepts = useQuery({ queryKey: ["concepts", token], queryFn: ({ signal }) => listConcepts(token, signal), retry: false });
  const versions = useQuery({ queryKey: ["versions", token, moduleId], queryFn: ({ signal }) => listVersions(token, moduleId, signal), retry: false });

  const [doc, setDoc] = useState<ModuleDoc | null>(() => {
    const { revision: _r, draft: _d, ...rest } = initial;
    void _r; void _d;
    return rest;
  });
  const [revision, setRevision] = useState(initial.revision ?? 1);
  const [dirty, setDirty] = useState(false);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [add, setAdd] = useState<DocActivity["type"]>("check");
  const [open, setOpen] = useState<Set<string>>(new Set()); // activity IDs that are expanded
  const toggle = (id: string) => setOpen((cur) => { const next = new Set(cur); if (!next.delete(id)) next.add(id); return next; });
  const allIds = doc?.lessons.flatMap((l) => l.activities.map((a) => a.activityId)) ?? [];
  /** Open a step from the outline, then scroll to it once it has rendered. */
  const jump = (id: string) => {
    setOpen((cur) => new Set(cur).add(id));
    setTimeout(() => document.getElementById(`act-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const edit = (fn: (d: ModuleDoc) => void) => {
    setDoc((cur) => { if (!cur) return cur; const next = structuredClone(cur); fn(next); return next; });
    setDirty(true);
    setNotice("");
  };

  const save = useMutation({
    mutationFn: async () => saveDraft(token, moduleId, doc as ModuleDoc, revision),
    onSuccess: (r) => { setRevision(r.revision); setDirty(false); setError(""); setProblems([]); setConflict(false); setNotice("Draft saved."); qc.invalidateQueries({ queryKey: ["author-modules", token] }); },
    onError: (e) => {
      setNotice("");
      if (e instanceof ApiError && e.code === "REVISION_CONFLICT") { setConflict(true); setError(e.message); return; }
      setError(e instanceof ApiError ? e.message : "The draft could not be saved.");
      setProblems(e instanceof ApiError ? problemsOf(e.details) : []);
    },
  });

  const publish = useMutation({
    mutationFn: async () => { if (dirty) await save.mutateAsync(); return publishModule(token, moduleId); },
    onSuccess: (r) => { setError(""); setProblems([]); setNotice(r.classesUpdated
        ? `Published as version ${r.version}. ${r.classesUpdated} class${r.classesUpdated === 1 ? "" : "es"} now use${r.classesUpdated === 1 ? "s" : ""} it, so students see it the next time they open the module.`
        : `Published as version ${r.version}.`); qc.invalidateQueries({ queryKey: ["versions", token, moduleId] }); qc.invalidateQueries({ queryKey: ["author-modules", token] }); qc.invalidateQueries({ queryKey: ["modules", token] }); qc.invalidateQueries({ queryKey: ["module-classes", token, moduleId] }); },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "ALREADY_PUBLISHED") {
        // Not a failure: the saved draft is already the latest version.
        setError(""); setProblems([]);
        setNotice("Nothing new to publish: the latest version already has these changes. If students don't see them, move their class to the latest version below.");
        return;
      }
      if (e instanceof ApiError && e.code === "REVISION_CONFLICT") { setConflict(true); }
      setNotice("");
      setError(e instanceof ApiError ? e.message : "The module could not be published.");
      setProblems(e instanceof ApiError ? problemsOf(e.details) : []);
    },
  });

  function reload() {
    if (dirty && !window.confirm("Reloading throws away your unsaved changes. Continue?")) return;
    onReload();
  }

  const busy = save.isPending || publish.isPending;
  return (
    <>
      {doc ? (
        <>
          <datalist id="concept-options">{concepts.data?.map((c) => <option key={c.concept} value={c.concept} />)}</datalist>
          <PageHeader
            back={{ href: "/instructor/curriculum/", label: "Back to Curriculum" }}
            title={doc.title || "Untitled module"}
            description="Students only see a module once you publish it."
            meta={
              <>
                <span className="badge badge-muted">Draft revision {revision}</span>
                {dirty ? <span className="badge badge-warn">Unsaved changes</span> : <span className="badge">Saved</span>}
                {versions.data ? <span>{versions.data.length === 0 ? "Not published yet" : `Latest published: version ${versions.data.length}`}</span> : null}
              </>
            }
          />
          <div className="sticky top-[4.25rem] z-30 -mx-2 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface/95 px-4 py-3 shadow-[var(--shadow-md)] backdrop-blur" role="toolbar" aria-label="Module actions">
            <p aria-live="polite" className="min-w-0 text-sm font-bold text-muted">{save.isPending ? "Saving…" : publish.isPending ? "Publishing…" : dirty ? "You have unsaved changes" : notice ? "" : "All changes saved"}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/author/versions/?id=${encodeURIComponent(moduleId)}`} className="btn btn-ghost btn-sm"><Icon name="history" className="size-4" />Versions{versions.data ? ` (${versions.data.length})` : ""}</Link>
              <button type="button" className="btn btn-secondary" disabled={busy || !dirty} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save draft"}</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => publish.mutate()}>{publish.isPending ? "Publishing…" : dirty ? "Save and publish" : "Publish"}</button>
            </div>
          </div>
          <div aria-live="polite">{notice ? <p className="callout font-bold">{notice}</p> : null}</div>
          {error ? (
            <div role="alert" className="callout callout-danger mt-3">
              <p className="font-bold text-danger">{error}</p>
              {problems.length > 0 ? (
                <ul className="mt-2 list-disc pl-6 text-sm">{problems.map((p, i) => <li key={i}><code>{p.path}</code> {p.message}</li>)}</ul>
              ) : null}
              {conflict ? <button type="button" className="btn btn-secondary mt-3" onClick={reload}>Load the latest version</button> : null}
            </div>
          ) : null}
          <div className="mt-6 grid items-start gap-8 xl:grid-cols-[14rem_minmax(0,1fr)]">
            <nav aria-label="Steps in this module" className="hidden xl:sticky xl:top-[9.5rem] xl:block">
              <p className="eyebrow">Steps</p>
              <ol className="mt-3 flex flex-col gap-1">
                {doc.lessons.flatMap((l) => l.activities).map((a, i) => (
                  <li key={a.activityId}>
                    <button type="button" onClick={() => jump(a.activityId)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-bold text-ink hover:bg-tint">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-tint text-xs text-brand">{i + 1}</span>
                      <Icon name={ACTIVITY_ICON[a.type]} className="size-4 shrink-0 text-muted" />
                      <span className="truncate">{a.title || a.type}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="min-w-0">
              <section className="card" aria-labelledby="details-h">
                <h2 id="details-h" className="text-lg">Module details</h2>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="module-title" className="label">Module title</label>
                    <input id="module-title" className="field mt-1" maxLength={120} value={doc.title} onChange={(e) => edit((d) => { d.title = e.target.value; })} />
                  </div>
                  {doc.lessons.length === 1 ? (
                    <div>
                      <label htmlFor="lesson-title-0" className="label">Lesson title</label>
                      <input id="lesson-title-0" className="field mt-1" maxLength={120} value={doc.lessons[0].title} onChange={(e) => edit((d) => { d.lessons[0].title = e.target.value; })} />
                    </div>
                  ) : null}
                </div>
              </section>
              <ModuleClassesPanel token={token} moduleId={moduleId} />
              <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                <h2>Steps</h2>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(new Set(allIds))}>Expand all</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(new Set())}>Collapse all</button>
                </div>
              </div>
              {doc.lessons.map((lesson, li) => (
                <section key={lesson.lessonId} aria-label={lesson.title || `Lesson ${li + 1}`}>
                  {doc.lessons.length > 1 ? (
                    <div className="mt-6">
                      <label htmlFor={`lesson-title-${li}`} className="label">Lesson {li + 1} title</label>
                      <input id={`lesson-title-${li}`} className="field mt-1 max-w-xl" maxLength={120} value={lesson.title} onChange={(e) => edit((d) => { d.lessons[li].title = e.target.value; })} />
                    </div>
                  ) : null}
                  {lesson.activities.map((a, ai) => (
                    <ActivityEditor key={a.activityId} a={a} token={token} open={open.has(a.activityId)} onToggle={() => toggle(a.activityId)}
                      onChange={(next) => edit((d) => { d.lessons[li].activities[ai] = next; })}
                      onRemove={a.type === "assessment" ? undefined : () => edit((d) => { d.lessons[li].activities.splice(ai, 1); })} />
                  ))}
                  {li === doc.lessons.length - 1 ? (
                    <div className="panel mt-4 flex flex-wrap items-end gap-3">
                      <div>
                        <label htmlFor="add-type" className="label">Add a step before the post-test</label>
                        <select id="add-type" className="field mt-1" value={add} onChange={(e) => setAdd(e.target.value as DocActivity["type"])}>
                          {ADDABLE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <button type="button" className="btn btn-secondary" onClick={() => {
                        const newId = `a-${Math.random().toString(36).slice(2, 8)}`;
                        setOpen((cur) => new Set(cur).add(newId));
                        edit((d) => {
                        const acts = d.lessons[li].activities;
                        const act: DocActivity = { activityId: newId, type: add, title: ADDABLE.find(([v]) => v === add)?.[1] ?? "" };
                        if (add === "video") Object.assign(act, { provider: "youtube", videoId: "", minSeconds: 0 });
                        if (add === "slides") Object.assign(act, { title: "Slides", slides: [] });
                        if (add === "check" || add === "exit") act.questions = [newQuestion(false)];
                        if (add === "worksheet") Object.assign(act, { instructions: "", fields: [newQuestion(true)] });
                        const post = acts.findIndex((x) => x.type === "assessment" && x.role === "post");
                        acts.splice(post === -1 ? acts.length : post, 0, act);
                      });
                      }}><Icon name="plus" className="size-4" />Add step</button>
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
function Body({ token, moduleId }: { token: string; moduleId: string }) {
  const [version, setVersion] = useState(0); // a new key remounts the editor with the latest draft
  const loaded = useQuery({ queryKey: ["draft", token, moduleId], queryFn: ({ signal }) => getModuleDoc(token, moduleId, true, signal), retry: false, refetchOnMount: "always", staleTime: Infinity });
  return (
    <>
      {loaded.isPending ? <div role="status" aria-label="Loading draft" className="skeleton h-40" /> : null}
      {loaded.isError ? <p role="alert" className="callout callout-danger font-bold text-danger">{loaded.error instanceof ApiError ? loaded.error.message : "We couldn't load this module."}</p> : null}
      {loaded.data ? <Editor key={`${version}-${loaded.dataUpdatedAt}`} token={token} moduleId={moduleId} initial={loaded.data} onReload={() => loaded.refetch().then(() => setVersion((v) => v + 1))} /> : null}
    </>
  );
}

export function ModuleEditorScreen() {
  const moduleId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={["cic_admin", "instructor"]}>
      {({ token, me }) => !me.permissions.canAuthor ? <p role="alert" className="callout callout-danger">You don&apos;t have permission to edit curriculum.</p>
        : moduleId ? <Body token={token} moduleId={moduleId} /> : <p role="alert" className="callout callout-danger">No module was chosen.</p>}
    </StaffPage>
  );
}
