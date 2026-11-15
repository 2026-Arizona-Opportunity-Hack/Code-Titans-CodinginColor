import { apiFetch } from "./client";

// Roster import calls, from docs/api.md section 4:
//   POST /classes/{classId}/roster/import?dryRun=true   preview, writes nothing
//   POST /classes/{classId}/roster/import               commit
// The CSV is sent as text inside the JSON body, not as a file upload.

export type DuplicateNames = "create" | "skip";

export type RosterImportRequest = {
  csv: string;
  /** "create" (default) adds a repeated name as a new student and flags it. "skip" ignores it. */
  duplicateNames?: DuplicateNames;
  /** Where newly created students start. Defaults to the class's current module on the server. */
  startModuleId?: string;
};

export type RowProblem = { row: number; reason: string };

export type PossibleDuplicate = { row: number; displayName: string; matchesStudentId: string };

/** The dry-run response, exactly as in api.md. */
export type RosterImportPreview = {
  toCreate: number;
  toUpdate: number;
  /** Columns the server ignored and never stored. */
  ignoredColumns: string[];
  possibleDuplicates: PossibleDuplicate[];
  errors: RowProblem[];
};

/**
 * The commit response (docs/api.md section 4). Valid rows are imported and rows with
 * problems are skipped. Imported students have no login words yet.
 */
export type RosterImportResult = {
  created: number;
  updated: number;
  /** Rows skipped because of the "skip repeated names" choice. */
  skipped: number;
  possibleDuplicates: PossibleDuplicate[];
  errors: RowProblem[];
  ignoredColumns: string[];
  /** New students who still need login words (POST /classes/{classId}/credentials). */
  credentialsNeeded: number;
};

function importPath(classId: string) {
  return `/classes/${encodeURIComponent(classId)}/roster/import`;
}

export function previewRosterImport(
  token: string,
  classId: string,
  body: RosterImportRequest,
  signal?: AbortSignal,
): Promise<RosterImportPreview> {
  return apiFetch<RosterImportPreview>(`${importPath(classId)}?dryRun=true`, { method: "POST", token, body, signal });
}

export function commitRosterImport(
  token: string,
  classId: string,
  body: RosterImportRequest,
): Promise<RosterImportResult> {
  return apiFetch<RosterImportResult>(importPath(classId), { method: "POST", token, body });
}

/** A student on a class roster (backend/lambda/class-api/roster.py). */
export type RosterStudent = {
  studentId: string;
  classId: string;
  displayName: string;
  /** Per-class number, never reused, so two students with the same name can be told apart. */
  rosterNumber: number;
  externalId: string | null;
  status: "active" | "inactive";
  startModuleId: string | null;
  /** False until login words have been issued for the student. */
  hasCredential: boolean;
};

/** Active students in a class who share a display name (GET .../roster/duplicates). */
export type DuplicateGroup = {
  displayName: string;
  students: { studentId: string; rosterNumber: number }[];
};

export function listRoster(
  token: string,
  classId: string,
  status?: RosterStudent["status"],
  signal?: AbortSignal,
): Promise<RosterStudent[]> {
  const query = status ? `?status=${status}` : "";
  return apiFetch<RosterStudent[]>(`/classes/${encodeURIComponent(classId)}/roster${query}`, { token, signal });
}

export function listDuplicates(token: string, classId: string, signal?: AbortSignal): Promise<DuplicateGroup[]> {
  return apiFetch<DuplicateGroup[]>(`/classes/${encodeURIComponent(classId)}/roster/duplicates`, { token, signal });
}
