import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { ClassSummary, StaffMe, StaffRole } from "../lib/api/staff";

// Fake staff API. Demo accounts use the token "staff_mock_<role>". Shapes follow the
// backend's GET /me and docs/api.md sections 2 and 4. Created classes live in memory,
// so they disappear when the page is reloaded.

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

function apiError(status: number, code: string, error: string) {
  return HttpResponse.json({ error, code, requestId: "req_mock" }, { status });
}

function roleOf(request: Request): StaffRole | null {
  const match = /^Bearer staff_mock_(cic_admin|instructor|reviewer)$/.exec(request.headers.get("Authorization") ?? "");
  return match ? (match[1] as StaffRole) : null;
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
];
