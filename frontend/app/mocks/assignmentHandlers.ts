import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { Assignment } from "../lib/api/assignments";
import { MODULES } from "./curriculumStore";
import { setStart } from "./studentStore";
import { register } from "./persist";
import { apiError, roleOf } from "./staffHandlers";

// Fake curriculum list and class assignments, behaving like the backend's curriculum.py and
// assignments.py. State lives in memory and resets when the page is reloaded.

const assignments = new Map<string, Assignment[]>([
  [
    "cls_01",
    [
      { moduleId: "py-intro", moduleVersion: 1, order: 1, targetDate: null, startedCount: 5 },
      { moduleId: "py-loops", moduleVersion: 1, order: 2, targetDate: "2026-11-20", startedCount: 0 },
      { moduleId: "py-functions", moduleVersion: 1, order: 3, targetDate: null, startedCount: 0 },
    ],
  ],
]);
register({
  key: "assignments",
  snapshot: () => Object.fromEntries(assignments),
  restore: (data: Record<string, Assignment[]>) => {
    assignments.clear();
    Object.entries(data).forEach(([classId, list]) => assignments.set(classId, list));
  },
});
const forClass = (classId: string) => {
  if (!assignments.has(classId)) assignments.set(classId, []);
  return assignments.get(classId)!;
};
export const titleOf = (moduleId: string) => MODULES.find((m) => m.moduleId === moduleId)?.title ?? moduleId;
const sorted = (list: Assignment[]) => [...list].sort((a, b) => a.order - b.order || a.moduleId.localeCompare(b.moduleId));

export const assignedFor = (classId: string) => sorted(forClass(classId));

export const assignmentHandlers = [
  http.post(`${env.apiUrl}/classes/:classId/students/:studentId/unlock`, async ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't change students.");
    const moduleId = ((await request.json().catch(() => ({}))) as { moduleId?: string }).moduleId ?? "";
    if (!forClass(String(params.classId)).some((a) => a.moduleId === moduleId)) return apiError(404, "NOT_FOUND", "Module is not assigned to this class");
    setStart(String(params.studentId), moduleId); // in the demo, unlocking makes it the student's start module
    return HttpResponse.json({ data: { studentId: params.studentId, moduleId, unlocked: true } });
  }),

  http.get(`${env.apiUrl}/classes/:classId/assignments`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't see class data.");
    return HttpResponse.json({ data: sorted(forClass(String(params.classId))) });
  }),

  http.post(`${env.apiUrl}/classes/:classId/assignments`, async ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't assign modules.");
    const body = (await request.json().catch(() => ({}))) as { moduleId?: string; targetDate?: string };
    const found = MODULES.find((m) => m.moduleId === body.moduleId);
    if (!found) return apiError(400, "VALIDATION_ERROR", "moduleId does not match a published module");
    const list = forClass(String(params.classId));
    if (list.some((a) => a.moduleId === found.moduleId)) return apiError(409, "CONFLICT", "This module is already assigned to the class");
    const created: Assignment = {
      moduleId: found.moduleId,
      moduleVersion: found.latestVersion,
      order: list.reduce((max, a) => Math.max(max, a.order), 0) + 1,
      targetDate: body.targetDate ?? null,
      startedCount: 0,
    };
    list.push(created);
    return HttpResponse.json({ data: created }, { status: 201 });
  }),

  http.patch(`${env.apiUrl}/classes/:classId/assignments/:moduleId`, async ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't change assignments.");
    const item = forClass(String(params.classId)).find((a) => a.moduleId === params.moduleId);
    if (!item) return apiError(404, "NOT_FOUND", "Assignment not found");
    const body = (await request.json().catch(() => ({}))) as { order?: number; targetDate?: string | null; moduleVersion?: number };
    if (body.moduleVersion !== undefined) {
      const latest = MODULES.find((m) => m.moduleId === item.moduleId)?.latestVersion ?? 1;
      if (body.moduleVersion <= item.moduleVersion || body.moduleVersion > latest) {
        return apiError(400, "VALIDATION_ERROR", "moduleVersion must be newer than the current one and already published");
      }
      if ((item.startedCount ?? 0) > 0 && role !== "cic_admin") {
        return apiError(403, "FORBIDDEN", "Students have started this module. Ask an administrator to change its version");
      }
      item.moduleVersion = body.moduleVersion;
    }
    if (body.order !== undefined) item.order = body.order;
    if (body.targetDate !== undefined) item.targetDate = body.targetDate;
    return HttpResponse.json({ data: item });
  }),

  http.delete(`${env.apiUrl}/classes/:classId/assignments/:moduleId`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't change assignments.");
    const list = forClass(String(params.classId));
    const at = list.findIndex((a) => a.moduleId === params.moduleId);
    if (at === -1) return apiError(404, "NOT_FOUND", "Assignment not found");
    list.splice(at, 1);
    return HttpResponse.json({ data: { unassigned: true } });
  }),
];
