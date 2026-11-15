import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { StudentHome } from "../lib/api/student";
import { rosterHandlers } from "./rosterHandlers";
import { staffHandlers } from "./staffHandlers";

// Fake API responses, shaped like docs/api.md (success: { data, meta }, errors: { error, code, requestId }).
// Demo student: class code K7M4QX, secret words maple-tiger-blue (signs in as Maya R.).

const DEMO_CLASS_CODE = "K7M4QX";
const DEMO_WORDS = "maple-tiger-blue";
const DEMO_TOKEN = "ses_mock_maya";
const MAX_FAILURES = 10; // docs/architecture.md section 5: 10 failures, then 429 for 5 minutes

let failures = 0;

function apiError(status: number, code: string, error: string, headers?: Record<string, string>) {
  return HttpResponse.json({ error, code, requestId: "req_mock" }, { status, headers });
}

function isSignedIn(request: Request) {
  return request.headers.get("Authorization") === `Bearer ${DEMO_TOKEN}`;
}

// Maya joined late: "Intro to Python" is catch-up, and her start module is Python Loops.
const home: StudentHome = {
  student: { displayName: "Maya R.", classId: "cls_01" },
  resume: { moduleId: "py-loops", activityId: "a-pre" },
  modules: [
    { moduleId: "py-intro", title: "Intro to Python", state: "catch_up", percent: 0 },
    { moduleId: "py-loops", title: "Python Loops", state: "available", percent: 0 },
    { moduleId: "py-functions", title: "Functions", state: "locked", percent: 0 },
    { moduleId: "py-lists", title: "Lists", state: "locked", percent: 0 },
  ],
};

export const handlers = [
  ...staffHandlers,
  ...rosterHandlers,

  http.get(`${env.apiUrl}/health`, () => HttpResponse.json({ data: { status: "ok" } })),

  http.post(`${env.apiUrl}/auth/student/login`, async ({ request }) => {
    if (failures >= MAX_FAILURES) {
      return apiError(429, "LOGIN_THROTTLED", "Too many attempts. Try again later.", { "Retry-After": "300" });
    }
    const body = (await request.json().catch(() => ({}))) as { classCode?: string; studentCode?: string };
    const ok = body.classCode?.toUpperCase() === DEMO_CLASS_CODE && body.studentCode === DEMO_WORDS;
    if (!ok) {
      failures += 1;
      // Uniform message: never reveal whether the class code or the words were wrong.
      return apiError(401, "INVALID_CREDENTIALS", "Invalid class code or secret words.");
    }
    failures = 0;
    return HttpResponse.json({
      data: {
        sessionToken: DEMO_TOKEN,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        student: { displayName: "Maya R.", classId: "cls_01" },
      },
    });
  }),

  http.post(`${env.apiUrl}/auth/student/logout`, ({ request }) => {
    if (!isSignedIn(request)) return apiError(401, "UNAUTHENTICATED", "Sign in again.");
    return HttpResponse.json({ data: { signedOut: true } });
  }),

  http.get(`${env.apiUrl}/student/home`, ({ request }) => {
    if (!isSignedIn(request)) return apiError(401, "UNAUTHENTICATED", "Sign in again.");
    return HttpResponse.json({ data: home, meta: { nextCursor: null } });
  }),
];
