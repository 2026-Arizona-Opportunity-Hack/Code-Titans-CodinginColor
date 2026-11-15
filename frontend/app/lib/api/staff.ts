import { apiFetch, apiFetchAll, apiFetchPage } from "./client";

// Calls for staff (instructor, CIC admin, reviewer): GET /me, plus the class endpoints
// in docs/api.md section 4. Staff use a Cognito token as the Bearer token.

export type StaffRole = "cic_admin" | "instructor" | "reviewer";

/** Matches the backend's GET /v1/me (backend/lambda/admin-api). */
export type StaffMe = {
  userId: string;
  role: StaffRole;
  displayName: string;
  /** canAuthor: may create modules and edit their own (admins and every instructor).
   *  canEditAll: may edit anyone's module (admins, or instructors with the admin-set flag). */
  permissions: { canAuthor: boolean; canEditAll?: boolean };
  classes: { classId: string }[];
  /**
   * The school an admin assigned to this person (Users screen). Instructors create classes
   * only in this school, so an instructor without one cannot create classes. null when unset.
   */
  orgId?: string | null;
  /** That school's name, for the header. null when no school is set. */
  orgName?: string | null;
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

/** Admins can narrow the list by school (orgId) or cohort. Instructors always get their own classes. */
export function listClasses(token: string, signal?: AbortSignal, filters: { orgId?: string; cohortId?: string } = {}): Promise<ClassSummary[]> {
  const q = new URLSearchParams();
  if (filters.orgId) q.set("orgId", filters.orgId);
  if (filters.cohortId) q.set("cohortId", filters.cohortId);
  return apiFetchAll<ClassSummary>(`/classes${q.size ? `?${q}` : ""}`, { token, signal });
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

export type StudentHit = { studentId: string; displayName: string; rosterNumber: number; classId: string; status: "active" | "inactive"; gradeLevel?: number | null };

/** GET /students?q=&cohortId=&classId=: find students by name. `truncated` means there are more than were returned. */
/** GET /students. An empty `q` lists every student in the caller's classes (up to 200). */
export async function searchStudents(token: string, filters: { q: string; classId?: string; cohortId?: string }, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: filters.q, limit: "200" });
  if (filters.classId) params.set("classId", filters.classId);
  if (filters.cohortId) params.set("cohortId", filters.cohortId);
  const { data, meta } = await apiFetchPage<StudentHit[]>(`/students?${params}`, { token, signal });
  return { students: data, truncated: Boolean(meta.truncated) };
}

/** POST /classes/{classId}/members: an admin adds another instructor to a class. */
export const addClassMember = (token: string, classId: string, userId: string) =>
  apiFetch<{ classId: string; userId: string }>(`/classes/${encodeURIComponent(classId)}/members`, { method: "POST", token, body: { userId } });
