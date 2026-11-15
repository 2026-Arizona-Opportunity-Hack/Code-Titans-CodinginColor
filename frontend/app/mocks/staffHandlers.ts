import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { ClassSummary, Org, StaffMe, StaffRole } from "../lib/api/staff";
import { register } from "./persist";
import { getRoster } from "./rosterStore";

// Fake staff API. Demo accounts use the token "staff_mock_<role>". Shapes follow the
// backend's GET /me and docs/api.md sections 2 and 4. Created classes live in memory,
// so they disappear when the page is reloaded.

export const ORGS: Org[] = [
  { orgId: "org_maryvale", name: "Maryvale High School", status: "active" },
  { orgId: "org_desert_edge", name: "Desert Edge High School", status: "active" },
  { orgId: "org_old_school", name: "Old Partner School", status: "archived" }, // hidden from the picker
];

// Same shape as the real class object (backend/lambda/class-api/classes.py).
function newClass(fields: Pick<ClassSummary, "classId" | "name" | "orgId" | "joinCode"> & Partial<ClassSummary>): ClassSummary {
  return {
    cohortId: null,
    status: "active",
    termStart: null,
    termEnd: null,
    currentModuleId: null,
    settings: { stuckFailedAttempts: 3, stuckTimeMultiplier: 2, notStartedDays: 1, inactiveSchoolDays: 3 },
    createdAt: "2026-08-01T00:00:00Z",
    instructors: [{ userId: "u-inst-00001", name: "Demo Teacher" }],
    ...fields,
  };
}

const classes: ClassSummary[] = [
  newClass({
    classId: "cls_01",
    name: "Period 3",
    orgId: "org_maryvale",
    joinCode: "K7M4QX",
    cohortId: "coh_maryvale01",
    termStart: "2026-08-17",
    termEnd: "2026-12-18",
  }),
  newClass({ classId: "cls_02", name: "Period 5", orgId: "org_maryvale", joinCode: "R2D9TW", cohortId: "coh_maryvale01" }),
];

register({
  key: "classes",
  snapshot: () => classes,
  restore: (data: ClassSummary[]) => classes.splice(0, classes.length, ...data),
});

register({ key: "orgs", snapshot: () => ORGS, restore: (d: Org[]) => ORGS.splice(0, ORGS.length, ...d) });
export const allClasses = () => classes;
export const findClass = (classId: string) => classes.find((c) => c.classId === classId);

export function apiError(status: number, code: string, error: string) {
  return HttpResponse.json({ error, code, requestId: "req_mock" }, { status });
}

export function roleOf(request: Request): StaffRole | null {
  const match = /^Bearer staff_mock_(cic_admin|instructor|external_teacher|reviewer)$/.exec(request.headers.get("Authorization") ?? "");
  return match ? (match[1] as StaffRole) : null;
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export const staffHandlers = [
  http.post(`${env.apiUrl}/auth/external/request-access`, () => HttpResponse.json({ data: { received: true } }, { status: 202 })),
  http.get(`${env.apiUrl}/me`, ({ request }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    const me: StaffMe = {
      userId: `usr_${role}`,
      role,
      displayName: { instructor: "Jordan Lee", external_teacher: "Eli Outside", cic_admin: "Diana Admin", reviewer: "Riley Reviewer" }[role],
      permissions: { canAuthor: role === "cic_admin", canEditAll: role === "cic_admin" },
      classes: role === "instructor" || role === "external_teacher" ? classes.map((c) => ({ classId: c.classId })) : [],
      // ASSUMPTION (see StaffMe in lib/api/staff.ts): not returned by the real backend yet.
      ...(role === "external_teacher" ? { orgId: "org_desertprep", orgName: "Desert Prep" } : role === "instructor" ? { orgId: "org_maryvale", orgName: "Maryvale High School" } : { orgId: null, orgName: null }),
    };
    return HttpResponse.json({ data: me });
  }),

  http.get(`${env.apiUrl}/classes`, ({ request }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't see class data.");
    const q = new URL(request.url).searchParams;
    const mine = role === "cic_admin" ? classes.filter((c) => (!q.get("orgId") || c.orgId === q.get("orgId")) && (!q.get("cohortId") || c.cohortId === q.get("cohortId"))) : classes;
    return HttpResponse.json({ data: mine, meta: { nextCursor: null } });
  }),

  http.post(`${env.apiUrl}/classes`, async ({ request }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't create classes.");
    const body = (await request.json().catch(() => ({}))) as Partial<ClassSummary>;
    if (!body.name?.trim()) return apiError(400, "VALIDATION_ERROR", "name is required.");
    if (!body.orgId) return apiError(400, "VALIDATION_ERROR", "orgId is required.");
    const created = newClass({
      classId: `cls_${String(classes.length + 1).padStart(2, "0")}`,
      name: body.name.trim(),
      orgId: body.orgId,
      joinCode: randomCode(),
      termStart: body.termStart ?? null,
      termEnd: body.termEnd ?? null,
      createdAt: new Date().toISOString(),
    });
    classes.push(created);
    return HttpResponse.json({ data: created }, { status: 201 });
  }),

  http.patch(`${env.apiUrl}/classes/:classId`, async ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't change classes.");
    const found = classes.find((c) => c.classId === params.classId);
    if (!found) return apiError(404, "NOT_FOUND", "Class not found.");
    const body = (await request.json().catch(() => ({}))) as Partial<ClassSummary>;
    if (body.currentModuleId) found.currentModuleId = body.currentModuleId;
    if (body.name?.trim()) found.name = body.name.trim();
    if (body.status === "active" || body.status === "archived") found.status = body.status;
    if (body.settings) {
      const limits: Record<string, [number, number]> = { stuckFailedAttempts: [1, 20], stuckTimeMultiplier: [1, 10], notStartedDays: [1, 14], inactiveSchoolDays: [1, 14] };
      for (const [k, v] of Object.entries(body.settings)) {
        const [lo, hi] = limits[k] ?? [1, 0];
        if (!Number.isInteger(v) || v < lo || v > hi) return apiError(400, "VALIDATION_ERROR", `${k} must be a whole number from ${lo} to ${hi}`);
      }
      found.settings = { ...found.settings, ...body.settings };
    }
    return HttpResponse.json({ data: found });
  }),

  http.post(`${env.apiUrl}/classes/:classId/members`, async ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role !== "cic_admin") return apiError(403, "FORBIDDEN", "Admins only.");
    if (!classes.some((c) => c.classId === params.classId)) return apiError(404, "NOT_FOUND", "Class not found.");
    const userId = ((await request.json().catch(() => ({}))) as { userId?: string }).userId;
    if (!userId) return apiError(400, "VALIDATION_ERROR", "userId must be an id");
    return HttpResponse.json({ data: { classId: params.classId, userId } }, { status: 201 });
  }),

  http.post(`${env.apiUrl}/classes/:classId/join-code/rotate`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't change classes.");
    const found = classes.find((c) => c.classId === params.classId);
    if (!found) return apiError(404, "NOT_FOUND", "Class not found.");
    found.joinCode = randomCode();
    return HttpResponse.json({ data: { classId: found.classId, joinCode: found.joinCode } });
  }),

  http.get(`${env.apiUrl}/classes/:classId`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't see class data.");
    const found = classes.find((c) => c.classId === params.classId);
    if (!found) return apiError(404, "NOT_FOUND", "Class not found.");
    // The detail call adds the student count and assignments (the list call does not).
    return HttpResponse.json({ data: { ...found, assignments: [], counts: { students: getRoster(found.classId).length } } });
  }),

  http.get(`${env.apiUrl}/admin/orgs`, ({ request }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role !== "cic_admin") return apiError(403, "FORBIDDEN", "Admins only.");
    return HttpResponse.json({ data: ORGS, meta: { nextCursor: null } });
  }),
];
