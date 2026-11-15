import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { ProgressMatrix } from "../lib/api/reports";
import { assignedFor, titleOf } from "./assignmentHandlers";
import { getRoster } from "./rosterStore";
import { apiError, roleOf } from "./staffHandlers";
import { moduleSeconds, moduleViews } from "./studentStore";

// Fake instructor reports, built from the same fake students the player updates, so what a
// student does in one tab shows up here. Active students only, as the real endpoint does.

function progressMatrix(classId: string): ProgressMatrix {
  const assigned = assignedFor(classId);
  return {
    modules: assigned.map((a) => ({ moduleId: a.moduleId, title: titleOf(a.moduleId), moduleVersion: a.moduleVersion })),
    students: getRoster(classId)
      .filter((s) => s.status === "active")
      .map((s) => {
        const { views, resume } = moduleViews(s.studentId);
        return {
          studentId: s.studentId,
          displayName: s.displayName,
          rosterNumber: s.rosterNumber,
          externalId: s.externalId,
          resume,
          modules: Object.fromEntries(
            assigned.map((a) => {
              const v = views.find((x) => x.moduleId === a.moduleId);
              const activeMinutes = Math.round(moduleSeconds(s.studentId, a.moduleId) / 60);
              return [a.moduleId, { state: v?.state ?? "locked", percent: v?.percent ?? 0, activeMinutes }];
            }),
          ),
        };
      }),
  };
}

export const reportHandlers = [
  http.get(`${env.apiUrl}/classes/:classId/progress`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't see class data.");
    return HttpResponse.json({ data: progressMatrix(String(params.classId)) });
  }),
];
