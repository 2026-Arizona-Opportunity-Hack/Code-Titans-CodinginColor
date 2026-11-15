import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { ApiKey, AuditEntry } from "../lib/api/admin";
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
