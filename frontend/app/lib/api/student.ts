import { apiFetch } from "./client";

// Types and calls for the student-facing endpoints in docs/api.md (sections 1 and 6).

export type StudentSession = {
  sessionToken: string;
  expiresAt: string;
  student: { displayName: string; classId: string };
};

export type ModuleState = "locked" | "available" | "in_progress" | "complete" | "catch_up";

// Field names follow the backend's student-api (feat/student-api branch), which is
// more specific than api.md section 6: modules carry { moduleId, title, state, percent }
// and the resume pointer is only { moduleId, activityId }.
export type HomeModule = {
  moduleId: string;
  title: string;
  state: ModuleState;
  /** Whole-number completion percent, 0 to 100. */
  percent: number;
};

export type ResumePointer = {
  moduleId: string;
  activityId: string;
};

export type StudentHome = {
  student: { displayName: string; classId: string };
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
