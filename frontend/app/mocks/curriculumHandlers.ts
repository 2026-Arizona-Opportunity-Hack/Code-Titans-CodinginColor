import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { DocActivity, ModuleDoc } from "../lib/api/curriculum";
import { MODULES } from "./curriculumStore";
import { apiError, roleOf } from "./staffHandlers";
import { DOCS, KEYS } from "./studentStore";

/** The published copy a staff member sees: the student's document plus answer keys. */
function staffDoc(moduleId: string): ModuleDoc | null {
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
    return HttpResponse.json({ data: MODULES, meta: { nextCursor: null } });
  }),

  http.get(`${env.apiUrl}/curriculum/concepts`, ({ request }) => {
    if (!roleOf(request)) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    const counts = new Map<string, number>();
    MODULES.filter((m) => m.latestVersion > 0).forEach((m) => m.concepts.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1)));
    return HttpResponse.json({ data: [...counts].sort().map(([concept, moduleCount]) => ({ concept, moduleCount })) });
  }),

  http.get(`${env.apiUrl}/curriculum/modules/:moduleId`, ({ request, params }) => {
    if (!roleOf(request)) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    const doc = staffDoc(String(params.moduleId));
    return doc ? HttpResponse.json({ data: doc }) : apiError(404, "NOT_FOUND", "Module not found");
  }),
];
