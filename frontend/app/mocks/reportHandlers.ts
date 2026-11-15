import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { Attention, ProgressMatrix, StuckReason } from "../lib/api/reports";
import { assignedFor, titleOf } from "./assignmentHandlers";
import { getRoster } from "./rosterStore";
import { apiError, roleOf } from "./staffHandlers";
import { moduleSeconds, moduleViews, statusMap } from "./studentStore";

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

// Who needs help is decided by the real server from attempts, hints, time and inactivity, which the
// fake server does not track, so a few demo students are flagged by hand. Students who have not
// touched their current module are "not started", as they would be on the real server.
const STUCK: Record<string, StuckReason[]> = {
  stu_cls_01_1: ["taking_longer_than_expected"],
  stu_cls_01_2: ["repeated_attempts", "asked_for_hints"],
};
const WAITING_DAYS: Record<string, number> = { stu_cls_01_4: 4, stu_cls_01_5: 4 };

function attention(classId: string): Attention {
  const result: Attention = { notStarted: [], stuck: [] };
  for (const s of getRoster(classId).filter((x) => x.status === "active")) {
    const { resume } = moduleViews(s.studentId);
    if (!resume) continue;
    const row = { studentId: s.studentId, displayName: s.displayName, rosterNumber: s.rosterNumber, externalId: s.externalId, ...resume };
    const started = [...statusMap(s.studentId).keys()].some((k) => k.startsWith(`${resume.moduleId}/`));
    if (!started) result.notStarted.push({ ...row, waitingDays: WAITING_DAYS[s.studentId] ?? 2 });
    else if (STUCK[s.studentId]) result.stuck.push({ ...row, reasons: STUCK[s.studentId] });
  }
  return result;
}

export const reportHandlers = [
  http.get(`${env.apiUrl}/classes/:classId/attention`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't see class data.");
    return HttpResponse.json({ data: attention(String(params.classId)) });
  }),

  http.get(`${env.apiUrl}/classes/:classId/progress`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't see class data.");
    return HttpResponse.json({ data: progressMatrix(String(params.classId)) });
  }),
];
