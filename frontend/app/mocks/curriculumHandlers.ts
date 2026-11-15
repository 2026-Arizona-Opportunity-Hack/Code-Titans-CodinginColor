import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { DocActivity, ModuleDoc } from "../lib/api/curriculum";
import { draftOf, publishedDoc } from "./authoringStore";
import { MODULES } from "./curriculumStore";
import { authoringHandlers } from "./authoringHandlers";
import { apiError, roleOf } from "./staffHandlers";
import { DOCS, KEYS } from "./studentStore";

/** The published copy a staff member sees: the student's document plus answer keys. */
export function staffDoc(moduleId: string): ModuleDoc | null {
  const src = DOCS[moduleId];
  const meta = MODULES.find((m) => m.moduleId === moduleId);
  if (!src || !meta) return null;
  const doc = structuredClone(src) as unknown as ModuleDoc;
  for (const lesson of doc.lessons) {
    for (const act of lesson.activities as DocActivity[]) {
      delete (act as { state?: unknown }).state;
      for (const q of [...(act.questions ?? []), ...(act.fields ?? [])]) {
        const key = KEYS[q.questionId ?? q.fieldId ?? ""];
        if (key !== undefined) q.answerKey = q.type === "numeric" || q.type === ("number" as string) ? Number(key) : key;
      }
    }
  }
  return { ...doc, version: meta.latestVersion };
}

export const curriculumHandlers = [
  http.get(`${env.apiUrl}/curriculum/modules`, ({ request }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    const status = new URL(request.url).searchParams.get("status") ?? "published";
    if (!["draft", "published", "all"].includes(status)) return apiError(400, "VALIDATION_ERROR", "status must be one of: draft, published, all");
    if (status !== "published" && role !== "cic_admin") return apiError(403, "FORBIDDEN", "Only authors can list unpublished modules");
    const list = MODULES.filter((m) => status === "all" || (status === "draft" ? m.latestVersion === 0 : m.latestVersion > 0));
    return HttpResponse.json({ data: list, meta: { nextCursor: null } });
  }),

  http.get(`${env.apiUrl}/curriculum/concepts`, ({ request }) => {
    if (!roleOf(request)) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    const counts = new Map<string, number>();
    MODULES.filter((m) => m.latestVersion > 0).forEach((m) => m.concepts.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1)));
    return HttpResponse.json({ data: [...counts].sort().map(([concept, moduleCount]) => ({ concept, moduleCount })) });
  }),

  ...authoringHandlers,

  http.get(`${env.apiUrl}/curriculum/modules/:moduleId`, ({ request, params }) => {
    if (!roleOf(request)) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    const id = String(params.moduleId);
    if (new URL(request.url).searchParams.get("draft") === "true") {
      if (roleOf(request) !== "cic_admin") return apiError(403, "FORBIDDEN", "Only authors can read drafts");
      const d = draftOf(id);
      return d ? HttpResponse.json({ data: { ...d.doc, revision: d.revision, draft: true } }) : apiError(404, "NOT_FOUND", "Module not found");
    }
    const doc = publishedDoc(id) ?? staffDoc(id);
    return doc ? HttpResponse.json({ data: doc }) : apiError(404, "NOT_FOUND", "Module not found");
  }),
];
