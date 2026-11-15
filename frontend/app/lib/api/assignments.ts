import { apiFetch } from "./client";

// Module assignments for a class (docs/api.md section 4, backend class-api/assignments.py).
// An assignment pins the module version that was latest when it was assigned, so publishing
// a newer version never changes a class that is already running.

export type Assignment = {
  moduleId: string;
  moduleVersion: number;
  /** Position in the class. Students work through modules in this order. */
  order: number;
  targetDate: string | null;
  /** Students with progress on this module. Present in the list response. */
  startedCount?: number;
};

const base = (classId: string) => `/classes/${encodeURIComponent(classId)}/assignments`;

export function listAssignments(token: string, classId: string, signal?: AbortSignal): Promise<Assignment[]> {
  return apiFetch<Assignment[]>(base(classId), { token, signal });
}

export function assignModule(
  token: string,
  classId: string,
  input: { moduleId: string; targetDate?: string },
): Promise<Assignment> {
  return apiFetch<Assignment>(base(classId), { method: "POST", token, body: input });
}

export function updateAssignment(
  token: string,
  classId: string,
  moduleId: string,
  changes: { order?: number; targetDate?: string | null; moduleVersion?: number },
): Promise<Assignment> {
  return apiFetch<Assignment>(`${base(classId)}/${encodeURIComponent(moduleId)}`, { method: "PATCH", token, body: changes });
}

export function unassignModule(token: string, classId: string, moduleId: string): Promise<unknown> {
  return apiFetch(`${base(classId)}/${encodeURIComponent(moduleId)}`, { method: "DELETE", token });
}
