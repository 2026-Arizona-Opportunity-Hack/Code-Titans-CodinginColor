import { apiFetch, apiFetchAll, apiFetchPage } from "./client";

// Calls for staff (instructor, CIC admin, reviewer): GET /me, plus the class endpoints
// in docs/api.md section 4. Staff use a Cognito token as the Bearer token.

export type StaffRole = "cic_admin" | "instructor" | "reviewer";

/** Matches the backend's GET /v1/me (backend/lambda/admin-api). */
export type StaffMe = {
  userId: string;
  role: StaffRole;
  displayName: string;
  permissions: { canAuthor: boolean };
  classes: { classId: string }[];
  /**
   * ASSUMPTION, NOT IN THE BACKEND YET: the instructor's school. POST /classes requires
   * orgId, but instructors cannot list schools (GET /admin/orgs is admin only), so /me
   * (or the class API) must supply it. Until it does, instructors cannot create classes.
   */
  orgId?: string;
};

/** A class, as returned by the backend's class API (backend/lambda/class-api/classes.py). */
export type ClassSummary = {
  classId: string;
  name: string;
  orgId: string;
  cohortId: string | null;
  status: "active" | "archived";
  joinCode: string;
  termStart: string | null;
  termEnd: string | null;
  currentModuleId: string | null;
  settings: {
    stuckFailedAttempts: number;
    stuckTimeMultiplier: number;
    notStartedDays: number;
    inactiveSchoolDays: number;
  };
  createdAt: string;
};

/** GET /classes/{classId} adds the student count and assignments to the class. */
export type ClassDetail = ClassSummary & {
  counts: { students: number };
  assignments: unknown[];
};

export type CreateClassInput = {
  name: string;
  orgId: string;
  cohortId?: string;
  termStart?: string;
  termEnd?: string;
};

// Matches the backend's GET /v1/admin/orgs (backend/lambda/admin-api/admin_orgs.py).
export type Org = { orgId: string; name: string; status?: "active" | "archived"; createdAt?: string };

export function getMe(token: string, signal?: AbortSignal): Promise<StaffMe> {
  return apiFetch<StaffMe>("/me", { token, signal });
}

export function listClasses(token: string, signal?: AbortSignal): Promise<ClassSummary[]> {
  return apiFetchAll<ClassSummary>("/classes", { token, signal });
}

export function getClass(token: string, classId: string, signal?: AbortSignal): Promise<ClassDetail> {
  return apiFetch<ClassDetail>(`/classes/${encodeURIComponent(classId)}`, { token, signal });
}

export function createClass(token: string, input: CreateClassInput): Promise<ClassSummary> {
  return apiFetch<ClassSummary>("/classes", { method: "POST", token, body: input });
}

/** Admin only (api.md section 2). */
export function listOrgs(token: string, signal?: AbortSignal): Promise<Org[]> {
  return apiFetchAll<Org>("/admin/orgs", { token, signal });
}

/** PATCH /classes/{classId}. currentModuleId is where late joiners start by default; it can be changed but not cleared. */
export function updateClass(
  token: string,
  classId: string,
  changes: { currentModuleId?: string; name?: string; status?: "active" | "archived"; settings?: Partial<ClassSummary["settings"]> },
): Promise<ClassSummary> {
  return apiFetch<ClassSummary>(`/classes/${encodeURIComponent(classId)}`, { method: "PATCH", token, body: changes });
}

/** POST /classes/{classId}/join-code/rotate: the old class code stops working straight away. */
export function rotateJoinCode(token: string, classId: string): Promise<{ classId: string; joinCode: string }> {
  return apiFetch(`/classes/${encodeURIComponent(classId)}/join-code/rotate`, { method: "POST", token });
}

export type StudentHit = { studentId: string; displayName: string; rosterNumber: number; classId: string; status: "active" | "inactive" };

/** GET /students?q=&cohortId=&classId=: find students by name. `truncated` means there are more than were returned. */
export async function searchStudents(token: string, filters: { q: string; classId?: string; cohortId?: string }, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: filters.q, limit: "50" });
  if (filters.classId) params.set("classId", filters.classId);
  if (filters.cohortId) params.set("cohortId", filters.cohortId);
  const { data, meta } = await apiFetchPage<StudentHit[]>(`/students?${params}`, { token, signal });
  return { students: data, truncated: Boolean(meta.truncated) };
}
