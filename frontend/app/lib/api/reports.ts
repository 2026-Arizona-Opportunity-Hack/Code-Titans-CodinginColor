import { apiFetch } from "./client";
import type { ModuleState } from "./student";

// Instructor reports (docs/api.md section 5, backend reports-api/reports_service.py).

/** One student's standing in one assigned module. */
export type ModuleProgress = { state: ModuleState; percent: number; activeMinutes: number };

export type ProgressStudent = {
  studentId: string;
  displayName: string;
  rosterNumber: number;
  externalId: string | null;
  /** Where the student should work next, or null when everything assigned is done. */
  resume: { moduleId: string; activityId: string } | null;
  /** Keyed by moduleId. */
  modules: Record<string, ModuleProgress>;
};

/** GET /classes/{classId}/progress: the roster by assigned modules matrix. Active students only. */
export type ProgressMatrix = {
  modules: { moduleId: string; title: string; moduleVersion: number }[];
  students: ProgressStudent[];
};

export function getProgress(token: string, classId: string, signal?: AbortSignal): Promise<ProgressMatrix> {
  return apiFetch<ProgressMatrix>(`/classes/${encodeURIComponent(classId)}/progress`, { token, signal });
}

export type StuckReason = "repeated_attempts" | "asked_for_hints" | "taking_longer_than_expected" | "inactive";

type AttentionRow = {
  studentId: string;
  displayName: string;
  rosterNumber: number;
  externalId: string | null;
  /** The step the student is on, or should start. */
  moduleId: string;
  activityId: string;
};

/** GET /classes/{classId}/attention. Thresholds come from the class settings. */
export type Attention = {
  /** Could have started their current module, but have no activity in it yet. */
  notStarted: (AttentionRow & { waitingDays: number | null })[];
  /** Started their current module but need help, with the reasons why. */
  stuck: (AttentionRow & { reasons: StuckReason[] })[];
};

export function getAttention(token: string, classId: string, signal?: AbortSignal): Promise<Attention> {
  return apiFetch<Attention>(`/classes/${encodeURIComponent(classId)}/attention`, { token, signal });
}

export type ActivityDetail = {
  activityId: string;
  type: "video" | "slides" | "check" | "exit" | "assessment" | "worksheet";
  state: "locked" | "available" | "in_progress" | "complete";
  attempts: number;
  bestScore: number | null;
  /** Time on task, in minutes (one decimal place). */
  activeMinutes: number;
  completedAt: number | string | null;
};

/** GET /classes/{classId}/students/{studentId}/progress: one student's activities, test scores and submissions. */
export type StudentDetail = {
  student: { studentId: string; displayName: string; rosterNumber: number; externalId: string | null };
  status: "active" | "inactive";
  resume: { moduleId: string; activityId: string } | null;
  modules: {
    moduleId: string;
    title: string;
    state: ModuleState;
    percent: number;
    /** Pretest and post-test scores in percent, or null if not taken yet. */
    pre: number | null;
    post: number | null;
    activities: ActivityDetail[];
  }[];
  submissions: {
    activityId: string;
    moduleId: string;
    submittedAt: number | string;
    reviewStatus: "pending" | "auto" | "reviewed" | null;
    autoScorePct: number | null;
    reviewScore: number | null;
    reviewComment: string | null;
  }[];
};

export function getStudentDetail(token: string, classId: string, studentId: string, signal?: AbortSignal): Promise<StudentDetail> {
  return apiFetch<StudentDetail>(`/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(studentId)}/progress`, { token, signal });
}
