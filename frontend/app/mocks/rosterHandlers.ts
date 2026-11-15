import Papa from "papaparse";
import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import type { PossibleDuplicate, RosterImportPreview, RosterImportRequest, RowProblem } from "../lib/api/roster";
import { apiError, roleOf } from "./staffHandlers";

// Fake roster import, behaving as docs/api.md section 4 describes. The class's existing
// students are fixed (nothing is stored), so the same file always gives the same preview.
// Try: a blank name (row error), "Alex Kim" (repeated name), externalId 1042 (update).

const EXISTING = [
  { studentId: "stu_01", displayName: "Ana R.", externalId: "" },
  { studentId: "stu_03", displayName: "Alex Kim", externalId: "1042" },
];

function analyze(body: RosterImportRequest): RosterImportPreview | null {
  const rows = Papa.parse<string[]>(body.csv ?? "", { skipEmptyLines: "greedy" }).data;
  const header = (rows[0] ?? []).map((h) => h.trim());
  const nameIndex = header.indexOf("displayName");
  if (nameIndex === -1) return null;
  const idIndex = header.indexOf("externalId");

  const errors: RowProblem[] = [];
  const possibleDuplicates: PossibleDuplicate[] = [];
  let toCreate = 0;
  let toUpdate = 0;

  rows.slice(1).forEach((cells, i) => {
    const row = i + 1;
    const name = (cells[nameIndex] ?? "").trim();
    const externalId = idIndex === -1 ? "" : (cells[idIndex] ?? "").trim();
    if (!name) {
      errors.push({ row, reason: "displayName is empty" });
      return;
    }
    // A row whose externalId already exists updates that student; no new student is made.
    if (externalId && EXISTING.some((s) => s.externalId === externalId)) {
      toUpdate += 1;
      return;
    }
    const sameName = EXISTING.find((s) => s.displayName.toLowerCase() === name.toLowerCase());
    if (sameName) {
      if (body.duplicateNames === "skip") return;
      possibleDuplicates.push({ row, displayName: name, matchesStudentId: sameName.studentId });
    }
    toCreate += 1;
  });

  const ignoredColumns = header.filter((h, i) => h && i !== nameIndex && i !== idIndex);
  return { toCreate, toUpdate, ignoredColumns, possibleDuplicates, errors };
}

export const rosterHandlers = [
  http.post(`${env.apiUrl}/classes/:classId/roster/import`, async ({ request }) => {
    const role = roleOf(request);
    if (!role) return apiError(401, "UNAUTHENTICATED", "Sign in required.");
    if (role === "reviewer") return apiError(403, "FORBIDDEN", "Reviewers can't import rosters.");

    const body = (await request.json().catch(() => ({}))) as RosterImportRequest;
    const preview = analyze(body);
    if (!preview) return apiError(400, "INVALID_CSV", "The CSV needs a displayName column.");

    if (new URL(request.url).searchParams.get("dryRun") === "true") {
      return HttpResponse.json({ data: preview });
    }
    // Commit: errors are never imported. (The real response shape is not defined in api.md.)
    return HttpResponse.json({
      data: {
        created: preview.toCreate,
        updated: preview.toUpdate,
        possibleDuplicates: preview.possibleDuplicates,
      },
    });
  }),
];
