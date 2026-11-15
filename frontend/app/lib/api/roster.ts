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
 * ASSUMPTION: api.md says "Commit the import" but does not describe the response,
 * and it does not say whether the commit also issues login credentials (the login
 * sheet comes from POST /classes/{classId}/credentials). All fields are optional so
 * the UI works with whatever the backend returns.
 */
export type RosterImportResult = {
  created?: number;
  updated?: number;
  skipped?: number;
  possibleDuplicates?: PossibleDuplicate[];
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
