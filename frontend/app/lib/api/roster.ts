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
  /** School grade, 6 to 12. null when not given. */
  gradeLevel: number | null;
};

/** The grades a student can be in (optional everywhere). */
export const GRADE_LEVELS = [6, 7, 8, 9, 10, 11, 12] as const;
export const gradeLabel = (g: number | null | undefined) => (g ? `Grade ${g}` : "—");

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

/**
 * POST /classes/{classId}/roster: adds one student (a late joiner) and issues their words.
 * The words come back in this response ONLY. The class code and link base are not returned:
 * the class page already has the code, and the link is on this app's own address.
 */
export type AddedStudent = RosterStudent & {
  studentCode: string;
  /** Set when an active student with the same name already exists (they are still added). */
  possibleDuplicateOf?: string;
};

export function addStudent(
  token: string,
  classId: string,
  input: { displayName: string; externalId?: string; startModuleId?: string; gradeLevel?: number },
): Promise<AddedStudent> {
  return apiFetch<AddedStudent>(`/classes/${encodeURIComponent(classId)}/roster`, { method: "POST", token, body: input });
}

/** PATCH /classes/{classId}/roster/{studentId}: rename, or set status inactive/active. */
export function updateStudent(token: string, classId: string, studentId: string, body: { displayName?: string; status?: RosterStudent["status"]; gradeLevel?: number | null }): Promise<RosterStudent> {
  return apiFetch<RosterStudent>(`/classes/${encodeURIComponent(classId)}/roster/${encodeURIComponent(studentId)}`, { method: "PATCH", token, body });
}

/** POST /classes/{classId}/roster/{studentId}/merge: folds this student into another one and removes it. */
export function mergeStudent(token: string, classId: string, studentId: string, intoStudentId: string): Promise<unknown> {
  return apiFetch(`/classes/${encodeURIComponent(classId)}/roster/${encodeURIComponent(studentId)}/merge`, { method: "POST", token, body: { intoStudentId } });
}

/** DELETE /classes/{classId}/roster/{studentId}: admin only. Removes the student and all their progress for good. */
export function deleteStudent(token: string, classId: string, studentId: string): Promise<unknown> {
  return apiFetch(`/classes/${encodeURIComponent(classId)}/roster/${encodeURIComponent(studentId)}`, { method: "DELETE", token });
}
