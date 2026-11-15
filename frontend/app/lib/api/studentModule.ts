import { apiFetch } from "./client";
import type { ModuleState } from "./student";

// The student's view of a module (docs/api.md section 6, backend student-api). The server
// removes answer keys and explanations before a module reaches a student.

export type Choice = { id: string; text: string };

export type Question = {
  questionId: string;
  type: "mcq" | "multi" | "short" | "number";
  prompt: string;
  points: number;
  choices?: Choice[];
  concept?: string;
  pairKey?: string;
};

export type WorksheetField = { fieldId: string; type: string; prompt: string };

export type ActivityState = "locked" | "available" | "in_progress" | "complete";

type ActivityBase = { activityId: string; title: string; state: ActivityState; required?: boolean; /** Author text, a safe markdown subset. */ body?: string };

export type Activity =
  | (ActivityBase & { type: "video"; provider: "youtube"; videoId: string; minSeconds: number })
  | (ActivityBase & { type: "slides"; minSeconds?: number; slides?: { title?: string; body?: string }[] })
  | (ActivityBase & { type: "check" | "exit"; questions: Question[]; passPct?: number })
  | (ActivityBase & { type: "assessment"; role: "pre" | "post"; questions: Question[] })
  | (ActivityBase & {
      type: "worksheet";
      instructions: string;
      fields: WorksheetField[];
      /** Saved answers, {fieldId: value}. */
      draft?: Record<string, string | number | null>;
    });

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
