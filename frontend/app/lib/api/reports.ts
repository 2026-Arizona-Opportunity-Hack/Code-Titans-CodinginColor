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
  type: "video" | "slides" | "check" | "exit" | "assessment" | "worksheet" | "code";
  state: "locked" | "available" | "in_progress" | "complete";
  attempts: number;
  /** Coding exercises with a submission: the code the student last submitted and how many tests their own run passed (self-reported). */
  title?: string;
  code?: string;
  testsPassed?: number;
  testsTotal?: number;
  hintCount?: number;
  bestScore: number | null;
  /** Time on task, in minutes (one decimal place). */
  activeMinutes: number;
  completedAt: number | string | null;
};

/** GET /classes/{classId}/students/{studentId}/progress: one student's activities, test scores and submissions. */
export type StudentDetail = {
  student: { studentId: string; displayName: string; rosterNumber: number; externalId: string | null; gradeLevel?: number | null };
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

/** The numbers behind learning gain (docs/architecture.md section 7.5). Only students with BOTH tests are counted in `n`. */
export type GainSummary = {
  nEnrolled: number | null;
  n: number;
  meanPre: number | null;
  meanPost: number | null;
  meanGain: number | null;
  normalizedGain: number | null;
};

export type ConceptGain = GainSummary & {
  concept: string;
  /** Fewer than 3 questions on a side: read the numbers with care. */
  lowItemCount: boolean;
  postN: number;
  /** Share of post-tested students at 80% or above, or null when nobody has taken the post-test. */
  masteryPct: number | null;
};

export type StudentGain = {
  studentId: string;
  displayName: string;
  rosterNumber: number;
  externalId: string | null;
  pre: number | null;
  post: number | null;
  gain: number | null;
  normalizedGain: number | null;
};

/** GET /classes/{classId}/modules/{moduleId}/gain */
export type ModuleGain = {
  definitions: Record<string, string>;
  moduleId: string;
  class: GainSummary;
  byConcept: ConceptGain[];
  students: StudentGain[];
};

export function getModuleGain(token: string, classId: string, moduleId: string, signal?: AbortSignal): Promise<ModuleGain> {
  return apiFetch<ModuleGain>(`/classes/${encodeURIComponent(classId)}/modules/${encodeURIComponent(moduleId)}/gain`, { token, signal });
}

/** GET /classes/{classId}/review-queue: worksheet answers that wait for a teacher's score. */
export type ReviewItem = {
  submissionId: string;
  student: { studentId: string; displayName: string; rosterNumber: number; externalId: string | null } | null;
  moduleId: string;
  activityId: string;
  submittedAt: number | string;
  /** The student's free-text answers, by field id. Show as plain text only. */
  answers: Record<string, unknown>;
  autoScorePct: number | null;
};

export const getReviewQueue = (token: string, classId: string, signal?: AbortSignal) =>
  apiFetch<ReviewItem[]>(`/classes/${encodeURIComponent(classId)}/review-queue?limit=50`, { token, signal });

/** PUT /classes/{classId}/submissions/{submissionId}/review: score is 0 to 100, comment up to 1000 characters. */
export const reviewSubmission = (token: string, classId: string, submissionId: string, body: { score: number; comment: string }) =>
  apiFetch<{ submissionId: string; reviewStatus: "reviewed" }>(
    `/classes/${encodeURIComponent(classId)}/submissions/${encodeURIComponent(submissionId)}/review`,
    { method: "PUT", token, body },
  );

/** GET /classes/{classId}/concepts: gain and mastery per concept across the class's modules. */
export type ConceptsReport = { definitions: Record<string, string>; concepts: ConceptGain[] };
export const getConcepts = (token: string, classId: string, signal?: AbortSignal) =>
  apiFetch<ConceptsReport>(`/classes/${encodeURIComponent(classId)}/concepts`, { token, signal });
