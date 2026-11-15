import { apiFetch } from "./client";

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
export const listApiKeys = (token: string, signal?: AbortSignal) => apiFetch<ApiKey[]>("/admin/api-keys", { token, signal });

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
};

/** GET /admin/users */
export const listUsers = (token: string, signal?: AbortSignal) => apiFetch<StaffUser[]>("/admin/users?limit=60", { token, signal });

/** POST /admin/users: Cognito emails the person a temporary password. canAuthor is for instructors only. */
export const inviteUser = (token: string, body: { email: string; name: string; role: "cic_admin" | "instructor" | "reviewer"; canAuthor?: boolean }) =>
  apiFetch<StaffUser>("/admin/users", { method: "POST", token, body });

/** PATCH /admin/users/{userId}: change role, canAuthor, or disable/enable. */
export const updateUser = (token: string, userId: string, body: { role?: StaffUser["role"]; canAuthor?: boolean; enabled?: boolean }) =>
  apiFetch<StaffUser>(`/admin/users/${encodeURIComponent(userId)}`, { method: "PATCH", token, body });
