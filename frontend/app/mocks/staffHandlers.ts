import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { StaffMe, StaffRole } from "../lib/api/staff";

// Fake staff API. Demo accounts use the token "staff_mock_<role>". Shapes follow the
// backend's GET /me and docs/api.md sections 2 and 4. Created classes live in memory,
// so they disappear when the page is reloaded.

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
      classes: role === "instructor" ? [{ classId: "cls_01" }, { classId: "cls_02" }] : [],
      // ASSUMPTION (see StaffMe in lib/api/staff.ts): not returned by the real backend yet.
      ...(role === "instructor" ? { orgId: "org_maryvale" } : {}),
    };
    return HttpResponse.json({ data: me });
  }),
];
