import { apiFetch } from "./client";

// Types and calls for the student-facing endpoints in docs/api.md (sections 1 and 6).

export type StudentSession = {
  sessionToken: string;
  expiresAt: string;
  student: { displayName: string; classId: string };
};

export type ModuleState = "locked" | "available" | "in_progress" | "complete" | "catch_up";

export type HomeModule = {
  moduleId: string;
  /** ASSUMPTION: api.md does not list titles, but the UI cannot show a path without them. */
  title: string;
  state: ModuleState;
  progressPct: number;
};

export type ResumePointer = {
  moduleId: string;
  activityId: string;
  /** ASSUMPTION: the display fields below are not in api.md yet. The UI falls back gracefully without them. */
  moduleTitle?: string;
  activityTitle?: string;
  step?: number;
  stepCount?: number;
};

export type StudentHome = {
  /** ASSUMPTION: not in api.md yet. */
  className?: string;
  /** null when everything assigned is finished, or nothing is assigned. */
  resume: ResumePointer | null;
  modules: HomeModule[];
};

export function loginStudent(classCode: string, studentCode: string): Promise<StudentSession> {
  return apiFetch<StudentSession>("/auth/student/login", { method: "POST", body: { classCode, studentCode } });
}

export function logoutStudent(token: string): Promise<unknown> {
  return apiFetch("/auth/student/logout", { method: "POST", token });
}

export function getStudentHome(token: string, signal?: AbortSignal): Promise<StudentHome> {
  return apiFetch<StudentHome>("/student/home", { token, signal });
}
