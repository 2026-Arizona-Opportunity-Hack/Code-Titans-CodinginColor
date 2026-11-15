import { apiFetch } from "./client";

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

/**
 * ASSUMPTION: api.md names these endpoints but not the class object, and the class API
 * is not built yet. Fields other than classId and name are treated as optional.
 */
export type ClassSummary = {
  classId: string;
  name: string;
  orgId?: string;
  cohortId?: string;
  status?: string;
  joinCode?: string;
  enrolled?: number;
  termStart?: string;
  termEnd?: string;
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
  return apiFetch<ClassSummary[]>("/classes", { token, signal });
}

export function getClass(token: string, classId: string, signal?: AbortSignal): Promise<ClassSummary> {
  return apiFetch<ClassSummary>(`/classes/${encodeURIComponent(classId)}`, { token, signal });
}

export function createClass(token: string, input: CreateClassInput): Promise<ClassSummary> {
  return apiFetch<ClassSummary>("/classes", { method: "POST", token, body: input });
}

/** Admin only (api.md section 2). */
export function listOrgs(token: string, signal?: AbortSignal): Promise<Org[]> {
  return apiFetch<Org[]>("/admin/orgs", { token, signal });
}
