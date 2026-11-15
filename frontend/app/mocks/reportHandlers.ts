import Papa from "papaparse";
import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { ActivityDetail, Attention, ConceptGain, GainSummary, ModuleGain, ProgressMatrix, StudentDetail, StuckReason } from "../lib/api/reports";
import { draftFor } from "./studentHandlers";
import { register } from "./persist";
import { recordAudit } from "./adminHandlers";
import { safeCell } from "../lib/loginLinks";
import { assignedFor, titleOf } from "./assignmentHandlers";
import { getRoster } from "./rosterStore";
import { apiError, roleOf } from "./staffHandlers";
import { assessmentScore, DOCS, moduleSeconds, moduleViews, secondsFor, statusMap } from "./studentStore";

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

function studentDetail(classId: string, studentId: string): StudentDetail | null {
  const s = getRoster(classId).find((x) => x.studentId === studentId);
  if (!s) return null;
  const { views, resume } = moduleViews(studentId);
  const done = Date.now() - 86_400_000;
  return {
    student: { studentId, displayName: s.displayName, rosterNumber: s.rosterNumber, externalId: s.externalId },
    status: s.status,
    resume,
    modules: assignedFor(classId).map((a) => {
      const v = views.find((x) => x.moduleId === a.moduleId)!;
      const activities: ActivityDetail[] = DOCS[a.moduleId].lessons.flatMap((l) => l.activities).map((act) => {
        const state = v.states[act.activityId];
        return {
          activityId: act.activityId, type: act.type, state,
          attempts: state === "complete" || state === "in_progress" ? 1 : 0,
          bestScore: act.type === "check" && state === "complete" ? 100 : null,
          activeMinutes: Math.round((secondsFor(`${studentId}/${a.moduleId}/${act.activityId}`) / 60) * 10) / 10,
          completedAt: state === "complete" ? done : null,
        };
      });
      return { moduleId: a.moduleId, title: titleOf(a.moduleId), state: v.state, percent: v.percent, pre: assessmentScore(studentId, a.moduleId, "pre"), post: assessmentScore(studentId, a.moduleId, "post"), activities };
    }),
    // A finished worksheet has a free-text field with no answer key, so it waits for the teacher.
    submissions: assignedFor(classId).flatMap((a) => (views.find((x) => x.moduleId === a.moduleId)?.states["a-ws"] === "complete" ? [{ activityId: "a-ws", moduleId: a.moduleId, submittedAt: done, reviewStatus: reviewed.has(submissionId(studentId, a.moduleId)) ? ("reviewed" as const) : ("pending" as const), autoScorePct: 100, reviewScore: reviewed.get(submissionId(studentId, a.moduleId))?.score ?? null, reviewComment: reviewed.get(submissionId(studentId, a.moduleId))?.comment ?? null }] : [])),
  };
}

const round = (x: number, places = 1) => Math.round(x * 10 ** places) / 10 ** places;
const DEFINITIONS = {
  gain: "post - pre, in percentage points",
  normalizedGain: "(post - pre) / (100 - pre); undefined when pre = 100",
  n: "students with both a pretest and a post-test",
};

function summarize(pairs: [number, number][], enrolled: number | null): GainSummary {
  if (pairs.length === 0) return { nEnrolled: enrolled, n: 0, meanPre: null, meanPost: null, meanGain: null, normalizedGain: null };
  const mean = (i: 0 | 1) => pairs.reduce((sum, p) => sum + p[i], 0) / pairs.length;
  const [pre, post] = [mean(0), mean(1)];
  return { nEnrolled: enrolled, n: pairs.length, meanPre: round(pre), meanPost: round(post), meanGain: round(post - pre), normalizedGain: pre >= 100 ? null : round((post - pre) / (100 - pre), 2) };
}

function moduleGain(classId: string, moduleId: string): ModuleGain | null {
  if (!assignedFor(classId).some((a) => a.moduleId === moduleId)) return null;
  const active = getRoster(classId).filter((s) => s.status === "active");
  const students = active.map((s) => {
    const pre = assessmentScore(s.studentId, moduleId, "pre");
    const post = assessmentScore(s.studentId, moduleId, "post");
    const both = pre !== null && post !== null;
    return {
      studentId: s.studentId, displayName: s.displayName, rosterNumber: s.rosterNumber, externalId: s.externalId, pre, post,
      gain: both ? round(post - pre) : null,
      normalizedGain: both && pre < 100 ? round((post - pre) / (100 - pre), 2) : null,
    };
  });
  const pairs = students.filter((s) => s.pre !== null && s.post !== null).map((s) => [s.pre!, s.post!] as [number, number]);
  const questions = DOCS[moduleId].lessons.flatMap((l) => l.activities).find((a) => a.type === "assessment")?.questions ?? [];
  const byConcept: ConceptGain[] = [...new Set(questions.map((q) => q.concept ?? "general"))].sort().map((concept) => ({
    ...summarize(pairs, null), nEnrolled: null, concept,
    lowItemCount: questions.filter((q) => (q.concept ?? "general") === concept).length < 3,
    postN: pairs.length,
    masteryPct: pairs.length ? Math.round((pairs.filter((p) => p[1] >= 80).length / pairs.length) * 100) : null,
  }));
  return { definitions: DEFINITIONS, moduleId, class: summarize(pairs, active.length), byConcept, students };
}

/** One class's completion and gain, for the cohort summary. */
export function classRollup(classId: string) {
  const m = progressMatrix(classId);
  const cells = m.students.flatMap((s) => m.modules.map((x) => s.modules[x.moduleId]));
  const complete = cells.filter((c) => c.state === "complete").length;
  const started = cells.filter((c) => c.percent > 0).length;
  const modules = m.modules.map((x) => ({ id: x.moduleId, title: x.title, g: moduleGain(classId, x.moduleId)! }));
  return { enrolled: m.students.length, cells: cells.length, complete, started, modules };
}

function exportCsv(classId: string, kind: string): string {
  if (kind === "progress") {
    const m = progressMatrix(classId);
    const header = ["rosterNumber", "student", ...m.modules.map((x) => `${x.title} percent`), ...m.modules.map((x) => `${x.title} minutes`)];
    return Papa.unparse({ fields: header, data: m.students.map((s) => [s.rosterNumber, safeCell(s.displayName), ...m.modules.map((x) => s.modules[x.moduleId].percent), ...m.modules.map((x) => s.modules[x.moduleId].activeMinutes)]) }, { newline: "\n" });
  }
  const rows = assignedFor(classId).flatMap((a) => (moduleGain(classId, a.moduleId)?.students ?? []).map((s) => [titleOf(a.moduleId), s.rosterNumber, safeCell(s.displayName), s.pre, s.post, s.gain, s.normalizedGain]));
  return Papa.unparse({ fields: ["module", "rosterNumber", "student", "pre", "post", "gain", "normalizedGain"], data: rows }, { newline: "\n" });
}

// Worksheets with a free-text field wait for a teacher. Reviewed ones leave the queue.
const reviewed = new Map<string, { score: number; comment: string }>();
register({ key: "reviews", snapshot: () => [...reviewed], restore: (d: [string, { score: number; comment: string }][]) => { reviewed.clear(); d.forEach(([k, v]) => reviewed.set(k, v)); } });
const submissionId = (studentId: string, moduleId: string) => `sub_${studentId}__${moduleId}`;

function reviewQueue(classId: string) {
  return getRoster(classId).filter((s) => s.status === "active").flatMap((s) =>
    assignedFor(classId).flatMap((a) => {
      const done = moduleViews(s.studentId).views.find((v) => v.moduleId === a.moduleId)?.states["a-ws"] === "complete";
      if (!done || reviewed.has(submissionId(s.studentId, a.moduleId))) return [];
      return [{ submissionId: submissionId(s.studentId, a.moduleId), student: { studentId: s.studentId, displayName: s.displayName, rosterNumber: s.rosterNumber, externalId: s.externalId }, moduleId: a.moduleId, activityId: "a-ws", submittedAt: Date.now() - 3600_000, answers: draftFor(s.studentId, a.moduleId, "a-ws"), autoScorePct: 100 }];
    }));
}

export const reportHandlers = [
  http.get(`${env.apiUrl}/classes/:classId/review-queue`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't see class data.");
    return HttpResponse.json({ data: reviewQueue(String(params.classId)), meta: { nextCursor: null } });
  }),

  http.put(`${env.apiUrl}/classes/:classId/submissions/:submissionId/review`, async ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't review submissions.");
    const body = (await request.json().catch(() => ({}))) as { score?: unknown; comment?: unknown };
    if (typeof body.score !== "number" || body.score < 0 || body.score > 100) return apiError(400, "VALIDATION_ERROR", "score must be a number from 0 to 100");
    const comment = body.comment ?? "";
    if (typeof comment !== "string" || comment.length > 1000) return apiError(400, "VALIDATION_ERROR", "comment must be text up to 1000 characters");
    const id = String(params.submissionId);
    if (!reviewQueue(String(params.classId)).some((i) => i.submissionId === id)) return apiError(404, "NOT_FOUND", "Submission not found in this class");
    reviewed.set(id, { score: body.score, comment });
    return HttpResponse.json({ data: { submissionId: id, reviewStatus: "reviewed" } });
  }),

  http.get(`${env.apiUrl}/classes/:classId/modules/:moduleId/gain`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't see class data.");
    const found = moduleGain(String(params.classId), String(params.moduleId));
    return found ? HttpResponse.json({ data: found }) : apiError(404, "NOT_FOUND", "Module is not assigned to this class");
  }),

  http.get(`${env.apiUrl}/classes/:classId/export`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't export class data.");
    const kind = new URL(request.url).searchParams.get("type") ?? "gain";
    if (kind !== "gain" && kind !== "progress") return apiError(400, "VALIDATION_ERROR", "type must be gain or progress");
    recordAudit("export", { classId: String(params.classId), type: kind });
    return new HttpResponse(exportCsv(String(params.classId), kind), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-${params.classId}.csv"` },
    });
  }),

  http.get(`${env.apiUrl}/classes/:classId/students/:studentId/progress`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't see class data.");
    const found = studentDetail(String(params.classId), String(params.studentId));
    return found ? HttpResponse.json({ data: found }) : apiError(404, "NOT_FOUND", "Student not found");
  }),

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
