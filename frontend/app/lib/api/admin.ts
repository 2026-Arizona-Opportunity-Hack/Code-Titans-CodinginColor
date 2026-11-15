import { apiFetch, apiFetchAll } from "./client";

export type ApiKey = {
  keyId: string;
  label: string;
  scopes: string[];
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  revoked: boolean;
  revokedAt: string | null;
};

export type AuditEntry = { at: string; actor: string; action: string; details: Record<string, string> };

/** GET /admin/api-keys: never includes the secret. */
export const listApiKeys = (token: string, signal?: AbortSignal) => apiFetchAll<ApiKey>("/admin/api-keys", { token, signal });

/** POST /admin/api-keys: `key` is the full secret and is in this response only. */
export const createApiKey = (token: string, body: { label: string; scopes: string[] }) =>
  apiFetch<ApiKey & { key: string }>("/admin/api-keys", { method: "POST", token, body });

export const revokeApiKey = (token: string, keyId: string) =>
  apiFetch<ApiKey>(`/admin/api-keys/${encodeURIComponent(keyId)}`, { method: "DELETE", token });

/** GET /admin/audit?from=&to=&limit=: newest first. Dates look like 2026-11-15. */
export const listAudit = (token: string, range: { from?: string; to?: string; limit?: number }, signal?: AbortSignal) => {
  const q = new URLSearchParams();
  if (range.from) q.set("from", range.from);
  if (range.to) q.set("to", range.to);
  q.set("limit", String(range.limit ?? 50));
  return apiFetch<AuditEntry[]>(`/admin/audit?${q}`, { token, signal });
};

export type StaffUser = {
  userId: string;
  email: string;
  name: string;
  role: "cic_admin" | "instructor" | "reviewer" | null;
  canAuthor: boolean;
  enabled: boolean;
  status: string;
  /** The school this person's classes are created in (instructors). null when none is set. */
  orgId: string | null;
};

/** GET /admin/users */
export const listUsers = (token: string, signal?: AbortSignal) => apiFetch<StaffUser[]>("/admin/users?limit=60", { token, signal });

/** POST /admin/users: Cognito emails the person a temporary password. canAuthor is for instructors only. */
export const inviteUser = (token: string, body: { email: string; name: string; role: "cic_admin" | "instructor" | "reviewer"; canAuthor?: boolean; orgId?: string }) =>
  apiFetch<StaffUser>("/admin/users", { method: "POST", token, body });

/** PATCH /admin/users/{userId}: change role, canAuthor, or disable/enable. */
export const updateUser = (token: string, userId: string, body: { role?: StaffUser["role"]; canAuthor?: boolean; enabled?: boolean; orgId?: string | null }) =>
  apiFetch<StaffUser>(`/admin/users/${encodeURIComponent(userId)}`, { method: "PATCH", token, body });

export type School = { orgId: string; name: string; status: "active" | "archived"; createdAt?: string };
export type Cohort = { cohortId: string; name: string; status: "active" | "archived"; createdAt: string; orgId?: string; classIds?: string[] };

export const listSchools = (token: string, signal?: AbortSignal) => apiFetchAll<School>("/admin/orgs", { token, signal });
export const createSchool = (token: string, name: string) => apiFetch<School>("/admin/orgs", { method: "POST", token, body: { name } });
export const updateSchool = (token: string, orgId: string, body: { name?: string; status?: School["status"] }) =>
  apiFetch<School>(`/admin/orgs/${encodeURIComponent(orgId)}`, { method: "PATCH", token, body });

export const listCohorts = (token: string, signal?: AbortSignal) => apiFetchAll<Cohort>("/admin/cohorts", { token, signal });
export const createCohort = (token: string, body: { name: string; orgId?: string }) => apiFetch<Cohort>("/admin/cohorts", { method: "POST", token, body });
/** classIds is the full list: classes missing from it are removed, and a listed class leaves any other cohort. */
export const updateCohort = (token: string, cohortId: string, body: { name?: string; status?: Cohort["status"]; classIds?: string[] }) =>
  apiFetch<Cohort>(`/admin/cohorts/${encodeURIComponent(cohortId)}`, { method: "PATCH", token, body });

type Gain = { nEnrolled: number | null; n: number; meanPre: number | null; meanPost: number | null; meanGain: number | null; normalizedGain: number | null };
export type CohortSummary = {
  cohortId: string;
  enrolled: number;
  classes: number;
  assignedModules: number;
  completion: { completionPct: number | null; startedPct: number | null };
  learningGain: Gain;
  byModule: (Gain & { moduleId: string; title: string; completionPct: number | null })[];
  byClass: (Gain & { classId: string; name: string; enrolled: number; completionPct: number | null })[];
  definitions: Record<string, string>;
};
export const getCohortSummary = (token: string, cohortId: string, signal?: AbortSignal) =>
  apiFetch<CohortSummary>(`/admin/cohorts/${encodeURIComponent(cohortId)}/summary`, { token, signal });
