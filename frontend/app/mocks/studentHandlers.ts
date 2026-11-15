import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { StudentHome } from "../lib/api/student";
import type { StudentModule } from "../lib/api/studentModule";
import { addSeconds, commit, DOCS, findLogin, moduleViews, personFromToken, secondsFor, statusMap } from "./studentStore";

// Fake student API (backend auth-student and student-api). Demo student: class code K7M4QX,
// words maple-tiger-blue (Maya R.). Words from the teacher's login sheet work too.

const MAX_FAILURES = 10; // docs/architecture.md section 5: 10 failures, then 429 for 5 minutes
let failures = 0;

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
  for (const l of copy.lessons) for (const a of l.activities) a.state = view.states[a.activityId];
  return copy;
}

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
