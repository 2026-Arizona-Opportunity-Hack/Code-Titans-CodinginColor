import { apiFetch } from "./client";

// GET /curriculum/modules (docs/api.md section 3, backend curriculum-api/curriculum.py).
// Instructors, authors, admins and reviewers can list PUBLISHED modules.

export type ModuleSummary = {
  moduleId: string;
  title: string;
  /** Latest published version. Always at least 1 in the published list. */
  latestVersion: number;
  concepts: string[];
  estimatedMinutes: number | null;
  updatedAt: string;
};

export function listModules(token: string, signal?: AbortSignal): Promise<ModuleSummary[]> {
  return apiFetch<ModuleSummary[]>("/curriculum/modules", { token, signal });
}
