import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { Cohort, CohortSummary, School } from "../lib/api/admin";
import { register } from "./persist";
import { classRollup } from "./reportHandlers";
import { allClasses, apiError, ORGS, roleOf } from "./staffHandlers";

const cohorts: Cohort[] = [{ cohortId: "coh_maryvale01", name: "Maryvale", status: "active", createdAt: "2026-08-01T00:00:00Z", orgId: "org_maryvale" }];
register({ key: "cohorts", snapshot: () => cohorts, restore: (d: Cohort[]) => cohorts.splice(0, cohorts.length, ...d) });const rand = (n: number) => Array.from({ length: n }, () => "abcdef0123456789"[Math.floor(Math.random() * 16)]).join("");
const withClasses = (c: Cohort): Cohort => ({ ...c, classIds: allClasses().filter((x) => x.cohortId === c.cohortId).map((x) => x.classId).sort() });
const gainOf = (pairs: number, pre: number[], post: number[], enrolled: number | null) => {
  const mean = (a: number[]) => (a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10 : null);
  const [mp, mq] = [mean(pre), mean(post)];
  return { nEnrolled: enrolled, n: pairs, meanPre: mp, meanPost: mq, meanGain: mp !== null && mq !== null ? Math.round((mq - mp) * 10) / 10 : null, normalizedGain: mp !== null && mq !== null && mp < 100 ? Math.round(((mq - mp) / (100 - mp)) * 100) / 100 : null };
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);
function adminOnly(request: Request) {
  const role = roleOf(request);
  if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
  return role === "cic_admin" ? null : apiError(403, "FORBIDDEN", "Only CIC admins can do this.");
}

export const cohortHandlers = [
  http.post(`${env.apiUrl}/admin/orgs`, async ({ request }) => {
    const denied = adminOnly(request);
    if (denied) return denied;
    const body = (await request.json().catch(() => ({}))) as { name?: string; kind?: "cic" | "external" };
    const name = body.name?.trim();
    if (!name) return apiError(400, "VALIDATION_ERROR", "name is required");
    const school: School = { orgId: `org_${rand(12)}`, name, kind: body.kind === "external" ? "external" : "cic", status: "active", createdAt: new Date().toISOString() };
    ORGS.push(school);
    return HttpResponse.json({ data: school }, { status: 201 });
  }),

  http.patch(`${env.apiUrl}/admin/orgs/:orgId`, async ({ request, params }) => {
    const denied = adminOnly(request);
    if (denied) return denied;
    const org = ORGS.find((o) => o.orgId === params.orgId);
    if (!org) return apiError(404, "NOT_FOUND", "Organization not found");
    const b = (await request.json().catch(() => ({}))) as { name?: string; status?: "active" | "archived" };
    if (!b.name?.trim() && !b.status) return apiError(400, "VALIDATION_ERROR", "Nothing to update");
    if (b.name?.trim()) org.name = b.name.trim();
    if (b.status) org.status = b.status;
    return HttpResponse.json({ data: org });
  }),

  http.get(`${env.apiUrl}/admin/cohorts`, ({ request }) => adminOnly(request) ?? HttpResponse.json({ data: cohorts, meta: { nextCursor: null } })),

  http.post(`${env.apiUrl}/admin/cohorts`, async ({ request }) => {
    const denied = adminOnly(request);
    if (denied) return denied;
    const b = (await request.json().catch(() => ({}))) as { name?: string; orgId?: string };
    if (!b.name?.trim()) return apiError(400, "VALIDATION_ERROR", "name is required");
    if (b.orgId && !ORGS.some((o) => o.orgId === b.orgId)) return apiError(400, "VALIDATION_ERROR", "orgId does not match an organization");
    const c: Cohort = { cohortId: `coh_${rand(12)}`, name: b.name.trim(), status: "active", createdAt: new Date().toISOString(), ...(b.orgId ? { orgId: b.orgId } : {}) };
    cohorts.push(c);
    return HttpResponse.json({ data: c }, { status: 201 });
  }),

  http.patch(`${env.apiUrl}/admin/cohorts/:cohortId`, async ({ request, params }) => {
    const denied = adminOnly(request);
    if (denied) return denied;
    const c = cohorts.find((x) => x.cohortId === params.cohortId);
    if (!c) return apiError(404, "NOT_FOUND", "Cohort not found");
    const b = (await request.json().catch(() => ({}))) as { name?: string; status?: "active" | "archived"; classIds?: string[] };
    if (!b.name?.trim() && !b.status && !b.classIds) return apiError(400, "VALIDATION_ERROR", "Nothing to update");
    if (b.classIds) {
      if (b.classIds.some((id) => !allClasses().some((x) => x.classId === id))) return apiError(400, "VALIDATION_ERROR", "classIds contains a class that does not exist");
      for (const cls of allClasses()) cls.cohortId = b.classIds.includes(cls.classId) ? c.cohortId : cls.cohortId === c.cohortId ? null : cls.cohortId;
    }
    if (b.name?.trim()) c.name = b.name.trim();
    if (b.status) c.status = b.status;
    return HttpResponse.json({ data: withClasses(c) });
  }),

  http.get(`${env.apiUrl}/admin/cohorts/:cohortId/summary`, ({ request, params }) => {
    const denied = adminOnly(request);
    if (denied) return denied;
    if (!cohorts.some((x) => x.cohortId === params.cohortId)) return apiError(404, "NOT_FOUND", "Cohort not found");
    const mine = allClasses().filter((x) => x.cohortId === params.cohortId);
    const rollups = mine.map((cls) => ({ cls, r: classRollup(cls.classId) }));
    const pairsOf = (r: ReturnType<typeof classRollup>) => r.modules.flatMap((m) => m.g.students.filter((s) => s.pre !== null && s.post !== null));
    const byClass = rollups.map(({ cls, r }) => {
      const p = pairsOf(r);
      return { classId: cls.classId, name: cls.name, enrolled: r.enrolled, completionPct: pct(r.complete, r.cells), ...gainOf(p.length, p.map((s) => s.pre!), p.map((s) => s.post!), r.enrolled) };
    });
    const all = rollups.flatMap(({ r }) => pairsOf(r));
    const modules = new Map<string, { title: string; enrolled: number; complete: number; pre: number[]; post: number[] }>();
    rollups.forEach(({ r }) => r.modules.forEach((m) => {
      const row = modules.get(m.id) ?? { title: m.title, enrolled: 0, complete: 0, pre: [], post: [] };
      row.enrolled += r.enrolled;
      m.g.students.forEach((s) => { if (s.pre !== null && s.post !== null) { row.pre.push(s.pre); row.post.push(s.post); } });
      modules.set(m.id, row);
    }));
    const enrolled = rollups.reduce((s, { r }) => s + r.enrolled, 0);
    const body: CohortSummary = {
      cohortId: String(params.cohortId), enrolled, classes: mine.length, assignedModules: modules.size,
      completion: { completionPct: pct(rollups.reduce((s, { r }) => s + r.complete, 0), rollups.reduce((s, { r }) => s + r.cells, 0)), startedPct: pct(rollups.reduce((s, { r }) => s + r.started, 0), rollups.reduce((s, { r }) => s + r.cells, 0)) },
      learningGain: gainOf(all.length, all.map((s) => s.pre!), all.map((s) => s.post!), enrolled),
      byModule: [...modules].map(([moduleId, m]) => ({ moduleId, title: m.title, completionPct: null, ...gainOf(m.pre.length, m.pre, m.post, m.enrolled) })),
      byClass,
      definitions: {},
    };
    return HttpResponse.json({ data: body });
  }),
];
