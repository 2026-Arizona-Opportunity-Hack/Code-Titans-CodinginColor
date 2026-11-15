import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { DocActivity, DocQuestion, ModuleDoc, Problem } from "../lib/api/curriculum";
import { draftOf, hasEntry, newEntry } from "./authoringStore";
import { MODULES } from "./curriculumStore";
import { apiError, roleOf } from "./staffHandlers";

const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const blank = (s: unknown) => typeof s !== "string" || s.trim() === "";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

const mcq = (id: string, extra: Partial<DocQuestion> = {}): DocQuestion => ({ questionId: id, type: "mcq", prompt: "", points: 1, choices: [{ id: "a", text: "" }, { id: "b", text: "" }], ...extra });
function template(moduleId: string, title: string): ModuleDoc {
  return { moduleId, title, lessons: [{ lessonId: "l1", title: "Lesson 1", activities: [
    { activityId: "a-pre", type: "assessment", role: "pre", title: "Pretest", questions: [mcq("q-pre-1", { pairKey: "pair-1" })] },
    { activityId: "a-vid", type: "video", title: "Watch", provider: "youtube", videoId: "", minSeconds: 0 },
    { activityId: "a-chk", type: "check", title: "Check your understanding", questions: [mcq("q-chk-1")] },
    { activityId: "a-ws", type: "worksheet", title: "Worksheet", instructions: "", fields: [{ fieldId: "f1", type: "text", prompt: "" }] },
    { activityId: "a-exit", type: "exit", title: "Exit question", questions: [mcq("q-exit-1")] },
    { activityId: "a-post", type: "assessment", role: "post", title: "Post-test", questions: [mcq("q-post-1", { pairKey: "pair-1" })] },
  ] }] };
}

/** A port of the server's publish checks (backend curriculum-api/moduledoc.py). */
function problems(doc: ModuleDoc): Problem[] {
  const out: Problem[] = [];
  const bad = (path: string, message: string) => out.push({ path, message });
  const text = (q: DocQuestion, p: string) => {
    if (blank(q.prompt)) bad(`${p}.prompt`, "is empty");
    if (q.type === "mcq" || q.type === "multi") {
      if ((q.choices?.length ?? 0) < 2) bad(`${p}.choices`, "needs at least 2 choices");
      q.choices?.forEach((c, k) => blank(c.text) && bad(`${p}.choices[${k}].text`, "is empty"));
    }
  };
  if (blank(doc.title)) bad("$.title", "is empty");
  const flat = doc.lessons.flatMap((l, i) => l.activities.map((a, j) => ({ a, p: `$.lessons[${i}].activities[${j}]` })));
  if (!flat.length) bad("$.lessons", "needs at least one activity");
  const pre = new Set<string>(); const post = new Set<string>();
  for (const { a, p } of flat) {
    if (blank(a.title)) bad(`${p}.title`, "is empty");
    if (a.type === "video" && !VIDEO_ID.test(a.videoId ?? "")) bad(`${p}.videoId`, "needs an 11-character YouTube video ID");
    if (a.type === "slides" && !a.slides?.some((s) => !blank(s.body))) bad(`${p}.slides`, "needs at least one slide with text");
    if (a.type === "worksheet") {
      if (!a.fields?.length) bad(`${p}.fields`, "needs at least one field");
      a.fields?.forEach((f, k) => (f.type === "text" ? blank(f.prompt) && bad(`${p}.fields[${k}].prompt`, "is empty") : text(f, `${p}.fields[${k}]`)));
    }
    if (a.type === "check" || a.type === "exit" || a.type === "assessment") {
      if (!a.questions?.length) bad(`${p}.questions`, "needs at least one question");
      a.questions?.forEach((q, k) => {
        const qp = `${p}.questions[${k}]`;
        text(q, qp);
        const noKey = q.answerKey === undefined || q.answerKey === "" || (Array.isArray(q.answerKey) && !q.answerKey.length);
        if (a.type !== "exit" && noKey) bad(`${qp}.answerKey`, "is required");
        if (a.type === "assessment") {
          if (blank(q.concept)) bad(`${qp}.concept`, "is required on assessment questions");
          else (a.role === "pre" ? pre : post).add(q.concept!);
          if (!((q.points ?? 1) > 0)) bad(`${qp}.points`, "must be greater than 0");
        }
      });
    }
  }
  if (flat.length) {
    if (!(flat[0].a.type === "assessment" && flat[0].a.role === "pre")) bad(flat[0].p, "the first activity must be the pretest");
    const last = flat[flat.length - 1];
    if (!(last.a.type === "assessment" && last.a.role === "post")) bad(last.p, "the last activity must be the post-test");
  }
  if ([...pre].sort().join() !== [...post].sort().join()) bad("$", "the pretest and post-test must cover the same concepts");
  return out;
}

const concepts = (doc: ModuleDoc) => [...new Set(doc.lessons.flatMap((l) => l.activities).flatMap((a: DocActivity) => (a.questions ?? []).map((q) => q.concept).filter(Boolean) as string[]))].sort();
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "module";

function authorOnly(request: Request) {
  const role = roleOf(request);
  if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
  return role === "cic_admin" ? null : apiError(403, "FORBIDDEN", "You do not have permission to edit curriculum");
}
const withDetails = (status: number, code: string, error: string, details: unknown) => HttpResponse.json({ error, code, requestId: "req_mock", details }, { status });

export const authoringHandlers = [
  http.post(`${env.apiUrl}/curriculum/modules`, async ({ request }) => {
    const denied = authorOnly(request);
    if (denied) return denied;
    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const title = (body.title ?? "").trim();
    if (!title || title.length > 120) return apiError(400, "VALIDATION_ERROR", "title is required and at most 120 characters");
    let id = slug(title);
    while (MODULES.some((m) => m.moduleId === id)) id = `${slug(title).slice(0, 35)}-${Math.random().toString(16).slice(2, 6)}`;
    const doc = template(id, title);
    newEntry(id, doc);
    MODULES.unshift({ moduleId: id, title, latestVersion: 0, concepts: [], estimatedMinutes: null, updatedAt: now(), status: "draft", hasUnpublishedChanges: true });
    return HttpResponse.json({ data: { ...doc, revision: 1, draft: true } }, { status: 201 });
  }),

  http.put(`${env.apiUrl}/curriculum/modules/:moduleId/draft`, async ({ request, params }) => {
    const denied = authorOnly(request);
    if (denied) return denied;
    const id = String(params.moduleId);
    const entry = draftOf(id);
    const meta = MODULES.find((m) => m.moduleId === id);
    if (!entry || !meta) return apiError(404, "NOT_FOUND", "Module not found");
    const expected = Number((request.headers.get("If-Match") ?? "").replace(/["W/]/g, ""));
    if (!Number.isInteger(expected)) return apiError(400, "VALIDATION_ERROR", "An If-Match header with the draft's current revision is required");
    const doc = (await request.json().catch(() => null)) as ModuleDoc | null;
    if (!doc || !Array.isArray(doc.lessons) || blank(doc.moduleId)) return apiError(400, "VALIDATION_ERROR", "The module document is not valid");
    if (expected !== entry.revision) return withDetails(409, "REVISION_CONFLICT", "Someone else saved this module. Reload it before saving again", { currentRevision: entry.revision });
    entry.doc = doc;
    entry.revision += 1;
    Object.assign(meta, { title: doc.title, concepts: concepts(doc), updatedAt: now(), hasUnpublishedChanges: true });
    return HttpResponse.json({ data: { revision: entry.revision, updatedAt: meta.updatedAt } });
  }),

  http.post(`${env.apiUrl}/curriculum/modules/:moduleId/publish`, ({ request, params }) => {
    const denied = authorOnly(request);
    if (denied) return denied;
    const id = String(params.moduleId);
    const entry = draftOf(id);
    const meta = MODULES.find((m) => m.moduleId === id);
    if (!entry || !meta) return apiError(404, "NOT_FOUND", "Module not found");
    if (entry.revision === entry.publishedRevision) return apiError(409, "ALREADY_PUBLISHED", `Nothing has changed since version ${meta.latestVersion}`);
    const found = problems(entry.doc);
    if (found.length) return withDetails(400, "VALIDATION_ERROR", "The module is not ready to publish", found);
    const version = meta.latestVersion + 1;
    entry.versions.push({ version, publishedAt: now(), doc: structuredClone(entry.doc) });
    entry.publishedRevision = entry.revision;
    Object.assign(meta, { latestVersion: version, status: "published", hasUnpublishedChanges: false });
    return HttpResponse.json({ data: { moduleId: id, version, publishedAt: now() } }, { status: 201 });
  }),

  http.get(`${env.apiUrl}/curriculum/modules/:moduleId/versions`, ({ request, params }) => {
    const denied = authorOnly(request);
    if (denied) return denied;
    const entry = hasEntry(String(params.moduleId)) || MODULES.some((m) => m.moduleId === params.moduleId) ? draftOf(String(params.moduleId)) : null;
    if (!entry) return apiError(404, "NOT_FOUND", "Module not found");
    return HttpResponse.json({ data: [...entry.versions].reverse().map((v) => ({ version: v.version, publishedAt: v.publishedAt, publishedBy: "admin_demo" })) });
  }),
];
