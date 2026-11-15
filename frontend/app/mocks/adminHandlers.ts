import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { AccessRequest, ApiKey, AuditEntry, Usage } from "../lib/api/admin";
import { register } from "./persist";
import { apiError, roleOf } from "./staffHandlers";

// Fake admin API: API keys (the secret is returned once, never stored) and the audit log.

const keys: ApiKey[] = [
  { keyId: "a1b2c3d4e5f6", label: "CIC dashboard", scopes: ["read:cohorts"], createdAt: "2026-11-01T17:00:00Z", createdBy: "admin_demo", lastUsedAt: "2026-11-13T20:15:00Z", revoked: false, revokedAt: null },
];
const audit: AuditEntry[] = [
  { at: "2026-11-01T17:00:00Z", actor: "admin_demo", action: "api_key_created", details: { keyId: "a1b2c3d4e5f6", label: "CIC dashboard" } },
];

register({ key: "adminKeys", snapshot: () => keys, restore: (d: ApiKey[]) => keys.splice(0, keys.length, ...d) });
register({ key: "adminAudit", snapshot: () => audit, restore: (d: AuditEntry[]) => audit.splice(0, audit.length, ...d) });

const requests: AccessRequest[] = [
  { requestId: "req_000000000001", name: "Sam Rivera", email: "sam@desertprep.example", organization: "Desert Prep", note: "Grade 9 intro to coding", status: "pending", createdAt: "2026-11-13T18:00:00Z", decidedAt: null, orgId: null },
];
register({ key: "accessRequests", snapshot: () => requests, restore: (d: AccessRequest[]) => requests.splice(0, requests.length, ...d) });
const usage: Usage = {
  generatedAt: "2026-11-14T12:00:00Z", activeWindowDays: 7, totals: { schools: 1, classes: 1, students: 24, studentsActiveLast7Days: 17 },
  schools: [{ orgId: "org_desertprep", name: "Desert Prep", status: "active", teachers: ["Pat Lee"], classes: 1, students: 24, studentsActiveLast7Days: 17, lastActivityAt: "2026-11-14T09:30:00Z",
    classList: [{ name: "Intro CS", status: "active", createdAt: "2026-09-01T00:00:00Z", teachers: ["Pat Lee"], students: 24, modulesAssigned: 3, studentsActiveLast7Days: 17, lastActivityAt: "2026-11-14T09:30:00Z" }] }],
};
const rand = (n: number, chars: string) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

/** Called by other fake handlers (class export) so it shows up in the log, as the real server does. */
export function recordAudit(action: string, details: Record<string, string>) {
  audit.unshift({ at: now(), actor: "admin_demo", action, details });
}

function adminOnly(request: Request) {
  const role = roleOf(request);
  if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
  return role === "cic_admin" ? null : apiError(403, "FORBIDDEN", "Only CIC admins can do this.");
}

export const adminHandlers = [
  http.get(`${env.apiUrl}/admin/access-requests`, ({ request }) => {
    const denied = adminOnly(request);
    if (denied) return denied;
    const status = new URL(request.url).searchParams.get("status") ?? "pending";
    return HttpResponse.json({ data: requests.filter((r) => r.status === status), meta: { nextCursor: null } });
  }),
  http.post(`${env.apiUrl}/admin/access-requests/:requestId/approve`, ({ request, params }) => {
    const denied = adminOnly(request);
    if (denied) return denied;
    const r = requests.find((x) => x.requestId === params.requestId);
    if (!r) return apiError(404, "NOT_FOUND", "Request not found");
    if (r.status !== "pending") return apiError(409, "CONFLICT", "This request has already been decided");
    Object.assign(r, { status: "approved", decidedAt: now(), orgId: "org_desertprep" });
    return HttpResponse.json({ data: r });
  }),
  http.post(`${env.apiUrl}/admin/access-requests/:requestId/deny`, ({ request, params }) => {
    const denied = adminOnly(request);
    if (denied) return denied;
    const r = requests.find((x) => x.requestId === params.requestId);
    if (!r) return apiError(404, "NOT_FOUND", "Request not found");
    if (r.status !== "pending") return apiError(409, "CONFLICT", "This request has already been decided");
    Object.assign(r, { status: "denied", decidedAt: now() });
    return HttpResponse.json({ data: r });
  }),
  http.get(`${env.apiUrl}/admin/usage`, ({ request }) => adminOnly(request) ?? HttpResponse.json({ data: usage })),
  http.get(`${env.apiUrl}/admin/api-keys`, ({ request }) => adminOnly(request) ?? HttpResponse.json({ data: keys, meta: { nextCursor: null } })),

  http.post(`${env.apiUrl}/admin/api-keys`, async ({ request }) => {
    const denied = adminOnly(request);
    if (denied) return denied;
    const body = (await request.json().catch(() => ({}))) as { label?: string; scopes?: string[] };
    const label = (body.label ?? "").trim();
    if (!label || label.length > 80) return apiError(400, "VALIDATION_ERROR", "label is required and at most 80 characters");
    if (!body.scopes?.length || body.scopes.some((s) => s !== "read:cohorts")) return apiError(400, "VALIDATION_ERROR", "scopes must be a list drawn from: read:cohorts");
    if (keys.filter((k) => !k.revoked).length >= 10) return apiError(400, "VALIDATION_ERROR", "There are already 10 active keys. Revoke one first");
    const keyId = rand(12, "abcdef0123456789");
    const created: ApiKey = { keyId, label, scopes: body.scopes, createdAt: now(), createdBy: "admin_demo", lastUsedAt: null, revoked: false, revokedAt: null };
    keys.unshift(created);
    recordAudit("api_key_created", { keyId, label });
    return HttpResponse.json({ data: { ...created, key: `cic_${keyId}_${rand(43, "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")}` } }, { status: 201 });
  }),

  http.delete(`${env.apiUrl}/admin/api-keys/:keyId`, ({ request, params }) => {
    const denied = adminOnly(request);
    if (denied) return denied;
    const key = keys.find((k) => k.keyId === params.keyId);
    if (!key) return apiError(404, "NOT_FOUND", "API key not found");
    if (!key.revoked) {
      key.revoked = true;
      key.revokedAt = now();
      recordAudit("api_key_revoked", { keyId: key.keyId });
    }
    return HttpResponse.json({ data: key });
  }),

  http.get(`${env.apiUrl}/admin/audit`, ({ request }) => {
    const denied = adminOnly(request);
    if (denied) return denied;
    const q = new URL(request.url).searchParams;
    const from = q.get("from");
    const to = q.get("to");
    for (const d of [from, to]) if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return apiError(400, "VALIDATION_ERROR", "Dates must look like 2026-11-15");
    const limit = Math.min(200, Math.max(1, Number(q.get("limit") ?? 50) || 50));
    const entries = audit.filter((e) => (!from || e.at.slice(0, 10) >= from) && (!to || e.at.slice(0, 10) <= to)).slice(0, limit);
    return HttpResponse.json({ data: entries, meta: { from: from ?? "", to: to ?? "" } });
  }),
];

// ---- Staff users (GET/POST /admin/users, PATCH /admin/users/{id}) ----
import type { StaffUser } from "../lib/api/admin";

const users: StaffUser[] = [
  { userId: "u-admin-0001", email: "admin@example.org", name: "Demo Admin", role: "cic_admin", canAuthor: true, enabled: true, status: "CONFIRMED", orgId: null },
  { userId: "u-inst-00001", email: "teacher@example.org", name: "Demo Teacher", role: "instructor", canAuthor: false, enabled: true, status: "CONFIRMED", orgId: "org_maryvale" },
  { userId: "u-rev-000001", email: "reviewer@example.org", name: "Demo Reviewer", role: "reviewer", canAuthor: false, enabled: true, status: "CONFIRMED", orgId: null },
];
register({ key: "adminUsers", snapshot: () => users, restore: (d: StaffUser[]) => users.splice(0, users.length, ...d) });
const ROLES = ["cic_admin", "instructor", "reviewer"];

export const userHandlers = [
  http.get(`${env.apiUrl}/admin/users`, ({ request }) => adminOnly(request) ?? HttpResponse.json({ data: users, meta: { nextCursor: null } })),

  http.post(`${env.apiUrl}/admin/users`, async ({ request }) => {
    const denied = adminOnly(request);
    if (denied) return denied;
    const b = (await request.json().catch(() => ({}))) as { email?: string; name?: string; role?: string; canAuthor?: boolean; orgId?: string };
    const email = (b.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]{1,64}@[^@\s]{1,189}$/.test(email)) return apiError(400, "VALIDATION_ERROR", "email is not valid");
    if (!b.name?.trim()) return apiError(400, "VALIDATION_ERROR", "name is required");
    if (!b.role || !ROLES.includes(b.role)) return apiError(400, "VALIDATION_ERROR", "role is required");
    if (b.canAuthor && b.role !== "instructor") return apiError(400, "VALIDATION_ERROR", "canAuthor can only be set for instructors");
    if (users.some((u) => u.email === email)) return apiError(409, "CONFLICT", "A user with this email already exists");
    const user: StaffUser = { userId: `u-${rand(10, "abcdef0123456789")}`, email, name: b.name.trim(), role: b.role as StaffUser["role"], canAuthor: b.role === "cic_admin" || Boolean(b.canAuthor), enabled: true, status: "FORCE_CHANGE_PASSWORD", orgId: b.orgId ?? null };
    users.push(user);
    return HttpResponse.json({ data: user }, { status: 201 });
  }),

  http.patch(`${env.apiUrl}/admin/users/:userId`, async ({ request, params }) => {
    const denied = adminOnly(request);
    if (denied) return denied;
    const user = users.find((u) => u.userId === params.userId);
    if (!user) return apiError(404, "NOT_FOUND", "User not found");
    const b = (await request.json().catch(() => ({}))) as { role?: string; canAuthor?: boolean; enabled?: boolean; orgId?: string | null };
    if (b.role === undefined && b.canAuthor === undefined && b.enabled === undefined && b.orgId === undefined) return apiError(400, "VALIDATION_ERROR", "Nothing to update");
    if (b.role && !ROLES.includes(b.role)) return apiError(400, "VALIDATION_ERROR", "role is not valid");
    if (user.userId === "u-admin-0001" && (b.enabled === false || (b.role && b.role !== "cic_admin"))) return apiError(400, "VALIDATION_ERROR", "You cannot demote or disable your own account");
    const role = (b.role ?? user.role) as StaffUser["role"];
    if (b.canAuthor && role !== "instructor") return apiError(400, "VALIDATION_ERROR", "canAuthor can only be set for instructors");
    user.role = role;
    user.canAuthor = role === "cic_admin" ? true : role === "instructor" ? (b.canAuthor ?? user.canAuthor) : false;
    if (b.enabled !== undefined) user.enabled = b.enabled;
    if (b.orgId !== undefined) user.orgId = b.orgId;
    return HttpResponse.json({ data: user });
  }),
];
