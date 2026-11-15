import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { StudentHome } from "../lib/api/student";
import type { StudentModule } from "../lib/api/studentModule";
import { register } from "./persist";
import { addSeconds, commit, DOCS, findLogin, KEYS, moduleViews, personFromToken, secondsFor, statusMap } from "./studentStore";

// Fake student API (backend auth-student and student-api). Demo student: class code K7M4QX,
// words maple-tiger-blue (Maya R.). Words from the teacher's login sheet work too.

const MAX_FAILURES = 10; // docs/architecture.md section 5: 10 failures, then 429 for 5 minutes
let failures = 0;

const drafts = new Map<string, Record<string, unknown>>(); // saved worksheet answers, per student step

export function studentError(status: number, code: string, error: string, headers?: Record<string, string>) {
  return HttpResponse.json({ error, code, requestId: "req_mock" }, { status, headers });
}
export const unauthenticated = () => studentError(401, "UNAUTHENTICATED", "Sign in again.");

export function studentModule(studentId: string, moduleId: string): StudentModule | null {
  const doc = DOCS[moduleId];
  if (!doc) return null;
  const view = moduleViews(studentId).views.find((v) => v.moduleId === moduleId)!;
  const copy = structuredClone(doc);
  copy.state = view.state;
  copy.percent = view.percent;
  for (const l of copy.lessons) {
    for (const a of l.activities) {
      a.state = view.states[a.activityId];
      const saved = drafts.get(`${studentId}/${moduleId}/${a.activityId}`);
      if (a.type === "worksheet" && saved) a.draft = saved as typeof a.draft;
    }
  }
  return copy;
}

const CSID = /^[A-Za-z0-9_-]{8,64}$/;
const submitted = new Map<string, { csid: string; result: unknown }>(); // safe retries: the first result is returned again

register({
  key: "student-steps",
  snapshot: () => ({ drafts: [...drafts], submitted: [...submitted] }),
  restore: (d: { drafts: [string, Record<string, unknown>][]; submitted: [string, { csid: string; result: unknown }][] }) => {
    drafts.clear();
    d.drafts.forEach(([k, v]) => drafts.set(k, v));
    submitted.clear();
    d.submitted.forEach(([k, v]) => submitted.set(k, v));
  },
});

export const studentHandlers = [
  http.post(`${env.apiUrl}/auth/student/login`, async ({ request }) => {
    if (failures >= MAX_FAILURES) {
      return studentError(429, "LOGIN_THROTTLED", "Too many attempts. Try again later.", { "Retry-After": "300" });
    }
    const body = (await request.json().catch(() => ({}))) as { classCode?: string; studentCode?: string };
    const person = findLogin(body.classCode ?? "", body.studentCode ?? "");
    if (!person) {
      failures += 1;
      return studentError(401, "INVALID_CREDENTIALS", "Invalid class code or secret words.");
    }
    failures = 0;
    return HttpResponse.json({
      data: {
        sessionToken: `ses_mock_${person.studentId}`,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        student: { displayName: person.displayName, classId: person.classId },
      },
    });
  }),

  http.post(`${env.apiUrl}/auth/student/logout`, ({ request }) =>
    personFromToken(request.headers.get("Authorization")) ? HttpResponse.json({ data: { signedOut: true } }) : unauthenticated(),
  ),

  http.get(`${env.apiUrl}/student/home`, ({ request }) => {
    const me = personFromToken(request.headers.get("Authorization"));
    if (!me) return unauthenticated();
    const { views, resume } = moduleViews(me.studentId);
    const home: StudentHome = {
      student: { displayName: me.displayName, classId: me.classId },
      resume,
      modules: views.map(({ moduleId, title, state, percent }) => ({ moduleId, title, state, percent })),
    };
    return HttpResponse.json({ data: home, meta: { nextCursor: null } });
  }),

  http.get(`${env.apiUrl}/student/modules/:moduleId`, ({ request, params }) => {
    const me = personFromToken(request.headers.get("Authorization"));
    if (!me) return unauthenticated();
    const doc = studentModule(me.studentId, String(params.moduleId));
    if (!doc) return studentError(404, "NOT_FOUND", "Module not found");
    if (doc.state === "locked") return studentError(403, "MODULE_LOCKED", "Finish the previous module first");
    return HttpResponse.json({ data: doc });
  }),

  http.put(`${env.apiUrl}/student/modules/:moduleId/activities/:activityId/draft`, async ({ request, params }) => {
    const me = personFromToken(request.headers.get("Authorization"));
    if (!me) return unauthenticated();
    const doc = studentModule(me.studentId, String(params.moduleId));
    const activity = doc?.lessons.flatMap((l) => l.activities).find((a) => a.activityId === params.activityId);
    if (!doc || !activity) return studentError(404, "NOT_FOUND", "Activity not found");
    if (activity.type !== "worksheet") return studentError(400, "VALIDATION_ERROR", "Drafts are only saved for worksheets");
    if (doc.state === "locked" || activity.state === "locked") return studentError(403, "FORBIDDEN", "Finish the earlier activities first");
    const body = (await request.json().catch(() => ({}))) as { answers?: { questionId: string; value: unknown }[] };
    drafts.set(`${me.studentId}/${doc.moduleId}/${activity.activityId}`, Object.fromEntries((body.answers ?? []).map((a) => [a.questionId, a.value])));
    const st = statusMap(me.studentId);
    if (!st.has(`${doc.moduleId}/${activity.activityId}`)) st.set(`${doc.moduleId}/${activity.activityId}`, "in_progress");
    return HttpResponse.json({ data: { savedAt: Date.now() } });
  }),

  http.post(`${env.apiUrl}/student/modules/:moduleId/activities/:activityId/heartbeat`, async ({ request, params }) => {
    const me = personFromToken(request.headers.get("Authorization"));
    if (!me) return unauthenticated();
    const { seconds } = (await request.json().catch(() => ({}))) as { seconds?: number };
    if (!Number.isInteger(seconds) || (seconds as number) < 1 || (seconds as number) > 120) {
      return studentError(400, "VALIDATION_ERROR", "seconds must be a whole number from 1 to 120");
    }
    const credited = Math.min(seconds as number, 45);
    const key = `${me.studentId}/${params.moduleId}/${params.activityId}`;
    addSeconds(key, credited);
    const st = statusMap(me.studentId);
    const statusKey = `${params.moduleId}/${params.activityId}`;
    if (!st.has(statusKey)) st.set(statusKey, "in_progress");
    return HttpResponse.json({ data: { credited } });
  }),

  http.post(`${env.apiUrl}/student/modules/:moduleId/activities/:activityId/submit`, async ({ request, params }) => {
    const me = personFromToken(request.headers.get("Authorization"));
    if (!me) return unauthenticated();
    const body = (await request.json().catch(() => ({}))) as { clientSubmissionId?: string; answers?: { questionId: string; value: unknown }[] };
    if (typeof body.clientSubmissionId !== "string" || !CSID.test(body.clientSubmissionId)) {
      return studentError(400, "VALIDATION_ERROR", "clientSubmissionId must be 8 to 64 letters, digits, - or _");
    }
    const doc = studentModule(me.studentId, String(params.moduleId));
    const activity = doc?.lessons.flatMap((l) => l.activities).find((a) => a.activityId === params.activityId);
    if (!doc || !activity) return studentError(404, "NOT_FOUND", "Activity not found");
    if (doc.state === "locked" || activity.state === "locked") return studentError(403, "FORBIDDEN", "Finish the earlier activities first");
    if (activity.type === "video" || activity.type === "slides") {
      return studentError(400, "VALIDATION_ERROR", "This activity type is not submitted with answers");
    }
    const key = `${me.studentId}/${doc.moduleId}/${activity.activityId}`;
    const prior = submitted.get(key);
    if (prior?.csid === body.clientSubmissionId) return HttpResponse.json({ data: prior.result });
    if (activity.type === "assessment" && activity.state === "complete") {
      return studentError(403, "ASSESSMENT_ALREADY_SUBMITTED", "This test was already submitted");
    }

    const given = new Map((body.answers ?? []).map((a) => [a.questionId, a.value]));
    if (activity.type === "worksheet") {
      // Fields with an answer key are checked automatically; the rest wait for the teacher.
      const keyed = activity.fields.filter((f) => KEYS[f.fieldId] !== undefined);
      const right = keyed.filter((f) => String(given.get(f.fieldId)) === KEYS[f.fieldId]).length;
      const autoScorePct = keyed.length ? Math.round((right / keyed.length) * 100) : null;
      const step = commit(me.studentId, doc.moduleId, activity.activityId, "complete");
      const result = { recorded: true, autoScorePct, pendingReview: keyed.length < activity.fields.length, ...step };
      submitted.set(key, { csid: body.clientSubmissionId, result });
      return HttpResponse.json({ data: result });
    }
    const results = activity.questions.map((q) => {
      const correct = given.get(q.questionId) === KEYS[q.questionId];
      const right = q.choices?.find((c) => c.id === KEYS[q.questionId])?.text;
      return { questionId: q.questionId, correct, explanation: right ? `The answer is: ${right}.` : undefined };
    });
    const scorePct = Math.round((results.filter((r) => r.correct).length / results.length) * 100);
    const passed = activity.type !== "check" || scorePct >= (activity.passPct ?? 0);
    const step = commit(me.studentId, doc.moduleId, activity.activityId, passed ? "complete" : "in_progress");
    // Tests never reveal scores or answers.
    const result = activity.type === "check" ? { recorded: true, scorePct, passed, results, ...step } : { recorded: true, ...step };
    submitted.set(key, { csid: body.clientSubmissionId, result });
    return HttpResponse.json({ data: result });
  }),

  http.post(`${env.apiUrl}/student/modules/:moduleId/activities/:activityId/complete`, ({ request, params }) => {
    const me = personFromToken(request.headers.get("Authorization"));
    if (!me) return unauthenticated();
    const doc = studentModule(me.studentId, String(params.moduleId));
    const activity = doc?.lessons.flatMap((l) => l.activities).find((a) => a.activityId === params.activityId);
    if (!doc || !activity) return studentError(404, "NOT_FOUND", "Activity not found");
    if (activity.type !== "video" && activity.type !== "slides") {
      return studentError(400, "VALIDATION_ERROR", "Only video and slides are marked done this way");
    }
    if (doc.state === "locked" || activity.state === "locked") return studentError(403, "FORBIDDEN", "Finish the earlier activities first");
    const spent = secondsFor(`${me.studentId}/${params.moduleId}/${params.activityId}`);
    if (spent < (activity.minSeconds ?? 0)) return studentError(409, "TOO_EARLY", "Keep watching before marking this done");
    return HttpResponse.json({ data: commit(me.studentId, doc.moduleId, activity.activityId, "complete") });
  }),
];
