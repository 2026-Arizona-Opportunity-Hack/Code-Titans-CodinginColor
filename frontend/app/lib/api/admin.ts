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
  role: "cic_admin" | "instructor" | "external_teacher" | "reviewer" | null;
  canAuthor: boolean;
  enabled: boolean;
  status: string;
  /** The school this person's classes are created in (instructors). null when none is set. */
  orgId: string | null;
};

/** GET /admin/users */
export const listUsers = (token: string, signal?: AbortSignal) => apiFetch<StaffUser[]>("/admin/users?limit=60", { token, signal });

/** POST /admin/users: Cognito emails the person a temporary password. canAuthor is for instructors only. */
export const inviteUser = (token: string, body: { email: string; name: string; role: NonNullable<StaffUser["role"]>; canAuthor?: boolean; orgId?: string }) =>
  apiFetch<StaffUser>("/admin/users", { method: "POST", token, body });

/** PATCH /admin/users/{userId}: change role, canAuthor, or disable/enable. */
export const updateUser = (token: string, userId: string, body: { role?: StaffUser["role"]; canAuthor?: boolean; enabled?: boolean; orgId?: string | null }) =>
  apiFetch<StaffUser>(`/admin/users/${encodeURIComponent(userId)}`, { method: "PATCH", token, body });

export type School = { orgId: string; name: string; kind: "cic" | "external"; status: "active" | "archived"; createdAt?: string };
export type Cohort = { cohortId: string; name: string; status: "active" | "archived"; createdAt: string; orgId?: string; classIds?: string[] };

export const listSchools = (token: string, signal?: AbortSignal) => apiFetchAll<School>("/admin/orgs", { token, signal });
/** `kind` cannot be changed later. An "external" school belongs to an external teacher: CIC sees its usage only. */
export const createSchool = (token: string, name: string, kind: School["kind"] = "cic") => apiFetch<School>("/admin/orgs", { method: "POST", token, body: { name, kind } });
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

export type AccessRequest = {
  requestId: string;
  name: string;
  email: string;
  organization: string;
  note: string | null;
  status: "pending" | "approved" | "denied";
  createdAt: string;
  decidedAt: string | null;
  orgId: string | null;
};
/** GET /admin/access-requests?status=: newest first. */
export const listAccessRequests = (token: string, status: AccessRequest["status"], signal?: AbortSignal) =>
  apiFetchAll<AccessRequest>(`/admin/access-requests?status=${status}`, { token, signal });
/** Approving invites the person as an external teacher. Without `orgId` a new external school is made from the request. */
export const approveAccessRequest = (token: string, requestId: string, orgId?: string) =>
  apiFetch<AccessRequest>(`/admin/access-requests/${encodeURIComponent(requestId)}/approve`, { method: "POST", token, body: orgId ? { orgId } : {} });
export const denyAccessRequest = (token: string, requestId: string) =>
  apiFetch<AccessRequest>(`/admin/access-requests/${encodeURIComponent(requestId)}/deny`, { method: "POST", token, body: {} });
type UsageClass = { name: string; status: string; createdAt: string; teachers: string[]; students: number; modulesAssigned: number; studentsActiveLast7Days: number; lastActivityAt: string | null };
/** GET /admin/usage: counts and dates only. Never student names, scores or codes. */
export type Usage = {
  generatedAt: string;
  activeWindowDays: number;
  totals: { schools: number; classes: number; students: number; studentsActiveLast7Days: number };
  schools: { orgId: string; name: string; status: string; teachers: string[]; classes: number; students: number; studentsActiveLast7Days: number; lastActivityAt: string | null; classList: UsageClass[] }[];
};
export const getUsage = (token: string, signal?: AbortSignal) => apiFetch<Usage>("/admin/usage", { token, signal });
