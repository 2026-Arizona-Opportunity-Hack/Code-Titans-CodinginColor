import Papa from "papaparse";
import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { PossibleDuplicate, RosterImportPreview, RosterImportRequest, RowProblem } from "../lib/api/roster";
import { addStudent, getRoster, issueWords, normalizeName } from "./rosterStore";
import { apiError, findClass, roleOf } from "./staffHandlers";
import { registerLogins } from "./studentStore";

// Fake roster API, behaving like the backend's roster.py and roster_import.py. An import
// changes the in-memory roster, so imported students show up on the class page.
// Try: a blank name (row error), "Sam Lee" (repeated name), externalId 1042 (update).

type Plan = RosterImportPreview & { skipped: number; creates: { name: string; externalId: string }[] };

function plan(classId: string, body: RosterImportRequest): Plan | null {
  const rows = Papa.parse<string[]>(body.csv ?? "", { skipEmptyLines: "greedy" }).data;
  const header = (rows[0] ?? []).map((h) => h.trim());
  const nameIndex = header.indexOf("displayName");
  if (nameIndex === -1) return null;
  const idIndex = header.indexOf("externalId");
  const roster = getRoster(classId);

  const errors: RowProblem[] = [];
  const possibleDuplicates: PossibleDuplicate[] = [];
  const creates: Plan["creates"] = [];
  let toUpdate = 0;
  let skipped = 0;

  rows.slice(1).forEach((cells, i) => {
    const row = i + 1;
    const name = (cells[nameIndex] ?? "").trim();
    const externalId = idIndex === -1 ? "" : (cells[idIndex] ?? "").trim();
    if (!name) {
      errors.push({ row, reason: "displayName is empty" });
      return;
    }
    // A row whose externalId already exists updates that student; no new student is made.
    if (externalId && roster.some((s) => s.externalId === externalId)) {
      toUpdate += 1;
      return;
    }
    const sameName = roster.find((s) => s.status === "active" && normalizeName(s.displayName) === normalizeName(name));
    if (sameName) {
      if (body.duplicateNames === "skip") {
        skipped += 1;
        return;
      }
      possibleDuplicates.push({ row, displayName: name, matchesStudentId: sameName.studentId });
    }
    creates.push({ name, externalId });
  });

  const ignoredColumns = header.filter((h, i) => h && i !== nameIndex && i !== idIndex);
  return { toCreate: creates.length, toUpdate, ignoredColumns, possibleDuplicates, errors, skipped, creates };
}

export const rosterHandlers = [
  http.post(`${env.apiUrl}/classes/:classId/credentials`, async ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't issue login words.");
    const found = findClass(String(params.classId));
    if (!found) return apiError(404, "NOT_FOUND", "Class not found.");
    const body = (await request.json().catch(() => ({}))) as { studentIds?: string[] };
    // As the real server does: no list means EVERY active student gets new words.
    const students = issueWords(found.classId, body.studentIds);
    registerLogins(found.joinCode, found.classId, students);
    return HttpResponse.json({ data: { classCode: found.joinCode, loginUrlBase: `${window.location.origin}/s`, students } });
  }),

  http.get(`${env.apiUrl}/classes/:classId/roster`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't see class data.");
    const status = new URL(request.url).searchParams.get("status");
    const rows = getRoster(String(params.classId)).filter((s) => !status || s.status === status);
    return HttpResponse.json({ data: rows, meta: { nextCursor: null } });
  }),

  http.get(`${env.apiUrl}/classes/:classId/roster/duplicates`, ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't see class data.");
    const groups = new Map<string, ReturnType<typeof getRoster>>();
    for (const s of getRoster(String(params.classId)).filter((x) => x.status === "active")) {
      groups.set(normalizeName(s.displayName), [...(groups.get(normalizeName(s.displayName)) ?? []), s]);
    }
    const data = [...groups.values()]
      .filter((g) => g.length > 1)
      .map((g) => ({
        displayName: g[0].displayName,
        students: g.map((s) => ({ studentId: s.studentId, rosterNumber: s.rosterNumber })),
      }));
    return HttpResponse.json({ data });
  }),

  http.post(`${env.apiUrl}/classes/:classId/roster/import`, async ({ request, params }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't import rosters.");

    const classId = String(params.classId);
    const body = (await request.json().catch(() => ({}))) as RosterImportRequest;
    const result = plan(classId, body);
    if (!result) return apiError(400, "INVALID_CSV", "The CSV needs a displayName column.");

    if (new URL(request.url).searchParams.get("dryRun") === "true") {
      const { toCreate, toUpdate, ignoredColumns, possibleDuplicates, errors } = result;
      return HttpResponse.json({ data: { toCreate, toUpdate, ignoredColumns, possibleDuplicates, errors } });
    }
    // Commit: valid rows are imported, rows with problems are skipped and reported.
    result.creates.forEach((c) => addStudent(classId, c.name, c.externalId));
    return HttpResponse.json({
      data: {
        created: result.toCreate,
        updated: result.toUpdate,
        skipped: result.skipped,
        possibleDuplicates: result.possibleDuplicates,
        errors: result.errors,
        ignoredColumns: result.ignoredColumns,
        credentialsNeeded: result.toCreate,
      },
    });
  }),
];
