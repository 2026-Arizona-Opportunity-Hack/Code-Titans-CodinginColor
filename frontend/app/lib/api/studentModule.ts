import { apiFetch } from "./client";
import type { ModuleState } from "./student";

// The student's view of a module (docs/api.md section 6, backend student-api). The server
// removes answer keys and explanations before a module reaches a student.

export type Choice = { id: string; text: string };

export type Question = {
  questionId: string;
  type: "mcq" | "multi" | "short" | "numeric";
  prompt: string;
  points: number;
  choices?: Choice[];
  concept?: string;
  pairKey?: string;
};

/** A test the browser runs against a student's code. The reference solution is never sent. */
export type CodeTestPublic = { testId: string; label: string; kind: "output" | "call"; stdin?: string; expression?: string; expected: string };
export type WorksheetField = { fieldId: string; type: string; prompt: string };

export type ActivityState = "locked" | "available" | "in_progress" | "complete";

type ActivityBase = { activityId: string; title: string; state: ActivityState; required?: boolean; /** Author text, a safe markdown subset. */ body?: string };

export type Activity =
  | (ActivityBase & { type: "video"; provider: "youtube"; videoId: string; minSeconds: number; /** Seconds the server has counted so far. */ activeSeconds?: number })
  | (ActivityBase & { type: "slides"; minSeconds?: number; activeSeconds?: number; slides?: { title?: string; body?: string }[]; document?: import("../slideDocument").SlideDocument })
  | (ActivityBase & { type: "check" | "exit"; questions: Question[]; passPct?: number })
  | (ActivityBase & { type: "assessment"; role: "pre" | "post"; questions: Question[] })
  | CodeActivityData
  | (ActivityBase & {
      type: "worksheet";
      instructions: string;
      /** The original printed worksheet, shown above the fields. */
      document?: import("../slideDocument").SlideDocument;
      fields: WorksheetField[];
      /** Saved answers, {fieldId: value}. */
      draft?: Record<string, string | number | null>;
    });

export type CodeActivityData = ActivityBase & {
  type: "code";
  language: "python";
  starterCode?: string;
  tests: CodeTestPublic[];
  /** Pass mark, default 100. */
  passPct?: number;
  /** The code the student last saved. */
  draftCode?: string;
};
export type StudentModule = {
  moduleId: string;
  title: string;
  moduleVersion: number;
  state: ModuleState;
  percent: number;
  lessons: { lessonId: string; title: string; activities: Activity[] }[];
};

export type Answer = { questionId: string; value: string | number | string[] | null };

/** What a submit or complete call returns: the new state and what comes next. */
export type StepResult = {
  activityState: ActivityState;
  next: { type: "activity"; activityId: string } | { type: "module_complete" };
  /** The id of the module this completion unlocked, if any. */
  moduleUnlocked: string | null;
  recorded?: boolean;
  /** Checks only. Tests never reveal scores or answers. */
  scorePct?: number;
  passed?: boolean;
  results?: { questionId: string; correct: boolean; explanation?: string }[];
  /** Coding exercises: how many of the author's tests the student's own run passed. */
  testsPassed?: number;
  testsTotal?: number;
  /** Worksheets. */
  autoScorePct?: number | null;
  pendingReview?: boolean;
};

const path = (moduleId: string, activityId: string, tail: string) =>
  `/student/modules/${encodeURIComponent(moduleId)}/activities/${encodeURIComponent(activityId)}/${tail}`;

export function getStudentModule(token: string, moduleId: string, signal?: AbortSignal): Promise<StudentModule> {
  return apiFetch<StudentModule>(`/student/modules/${encodeURIComponent(moduleId)}`, { token, signal });
}

/** Marks video or slides done. Fails with TOO_EARLY before the minimum time has passed. */
export function completeActivity(token: string, moduleId: string, activityId: string): Promise<StepResult> {
  return apiFetch<StepResult>(path(moduleId, activityId, "complete"), { method: "POST", token });
}

/** Active time on task: 1 to 120 whole seconds. The server credits at most 45 per call. */
export function sendHeartbeat(token: string, moduleId: string, activityId: string, seconds: number): Promise<{ credited: number }> {
  return apiFetch(path(moduleId, activityId, "heartbeat"), { method: "POST", token, body: { seconds } });
}

/** Reuse the same clientSubmissionId when retrying: the server returns the first result (api.md section 6). */
export function submitActivity(
  token: string,
  moduleId: string,
  activityId: string,
  clientSubmissionId: string,
  answers: Answer[],
): Promise<StepResult> {
  return apiFetch<StepResult>(path(moduleId, activityId, "submit"), {
    method: "POST",
    token,
    body: { clientSubmissionId, answers },
  });
}

export function saveDraft(token: string, moduleId: string, activityId: string, answers: Answer[]): Promise<{ savedAt: number }> {
  return apiFetch(path(moduleId, activityId, "draft"), { method: "PUT", token, body: { answers } });
}

/** A coding exercise: send the code and what the browser's test run found. The server works the score out from the module's test list. */
export function submitCode(
  token: string,
  moduleId: string,
  activityId: string,
  clientSubmissionId: string,
  code: string,
  results: { testId: string; passed: boolean }[],
): Promise<StepResult> {
  return apiFetch<StepResult>(path(moduleId, activityId, "submit"), { method: "POST", token, body: { clientSubmissionId, code, results } });
}
export function saveCodeDraft(token: string, moduleId: string, activityId: string, code: string): Promise<{ savedAt: number }> {
  return apiFetch(path(moduleId, activityId, "draft"), { method: "PUT", token, body: { code } });
}
/** POST /student/hints: one Socratic hint on a check, worksheet or coding exercise. Never available on tests. */
export function requestHint(
  token: string,
  body: { moduleId: string; activityId: string; questionId?: string; question?: string; code?: string; failedTests?: string[] },
): Promise<{ hint: string; level: 1 | 2 | 3; remainingToday: number }> {
  return apiFetch("/student/hints", { method: "POST", token, body });
}
