import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { ClassSummary, Org, StaffMe, StaffRole } from "../lib/api/staff";

// Fake staff API. Demo accounts use the token "staff_mock_<role>". Shapes follow the
// backend's GET /me and docs/api.md sections 2 and 4. Created classes live in memory,
// so they disappear when the page is reloaded.

const ORGS: Org[] = [
  { orgId: "org_maryvale", name: "Maryvale High School", status: "active" },
  { orgId: "org_desert_edge", name: "Desert Edge High School", status: "active" },
  { orgId: "org_old_school", name: "Old Partner School", status: "archived" }, // hidden from the picker
];

const classes: ClassSummary[] = [
  {
    classId: "cls_01",
    name: "Period 3",
    orgId: "org_maryvale",
    status: "active",
    joinCode: "K7M4QX",
    enrolled: 28,
    termStart: "2026-08-17",
    termEnd: "2026-12-18",
  },
  { classId: "cls_02", name: "Period 5", orgId: "org_maryvale", status: "active", joinCode: "R2D9TW", enrolled: 24 },
];

export function apiError(status: number, code: string, error: string) {
  return HttpResponse.json({ error, code, requestId: "req_mock" }, { status });
}

export function roleOf(request: Request): StaffRole | null {
  const match = /^Bearer staff_mock_(cic_admin|instructor|reviewer)$/.exec(request.headers.get("Authorization") ?? "");
  return match ? (match[1] as StaffRole) : null;
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

export const staffHandlers = [
  http.get(`${env.apiUrl}/me`, ({ request }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    const me: StaffMe = {
      userId: `usr_${role}`,
      role,
      displayName: { instructor: "Jordan Lee", cic_admin: "Diana Admin", reviewer: "Riley Reviewer" }[role],
      permissions: { canAuthor: role === "cic_admin" },
      classes: role === "instructor" ? classes.map((c) => ({ classId: c.classId })) : [],
      // ASSUMPTION (see StaffMe in lib/api/staff.ts): not returned by the real backend yet.
      ...(role === "instructor" ? { orgId: "org_maryvale" } : {}),
    };
    return HttpResponse.json({ data: me });
  }),

  http.get(`${env.apiUrl}/classes`, ({ request }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't see class data.");
    return HttpResponse.json({ data: classes, meta: { nextCursor: null } });
  }),

  http.post(`${env.apiUrl}/classes`, async ({ request }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't create classes.");
    const body = (await request.json().catch(() => ({}))) as Partial<ClassSummary>;
    if (!body.name?.trim()) return apiError(400, "VALIDATION_ERROR", "name is required.");
    if (!body.orgId) return apiError(400, "VALIDATION_ERROR", "orgId is required.");
    const created: ClassSummary = {
      classId: `cls_${String(classes.length + 1).padStart(2, "0")}`,
      name: body.name.trim(),
      orgId: body.orgId,
      status: "active",
      joinCode: randomCode(),
      enrolled: 0,
      ...(body.termStart ? { termStart: body.termStart } : {}),
      ...(body.termEnd ? { termEnd: body.termEnd } : {}),
    };
    classes.push(created);
    return HttpResponse.json({ data: created }, { status: 201 });
  }),

  http.get(`${env.apiUrl}/classes/:classId`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't see class data.");
    const found = classes.find((c) => c.classId === params.classId);
    return found ? HttpResponse.json({ data: found }) : apiError(404, "NOT_FOUND", "Class not found.");
  }),

  http.get(`${env.apiUrl}/admin/orgs`, ({ request }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role !== "cic_admin") return apiError(403, "FORBIDDEN", "Admins only.");
    return HttpResponse.json({ data: ORGS, meta: { nextCursor: null } });
  }),
];
