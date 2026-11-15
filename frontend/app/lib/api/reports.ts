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
