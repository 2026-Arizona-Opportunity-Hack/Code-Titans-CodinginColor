import { apiFetch } from "./client";

// POST /classes/{classId}/credentials (docs/api.md section 4, backend credential_routes.py).
// Issues secret words for students. The words are returned in this response ONLY: the server
// stores a one-way hash, so they can never be shown again.
//
// DANGER: giving the call no student list resets EVERY active student's words and signs them
// out. Always pass the students who need words.

export type LoginSheetStudent = {
  studentId: string;
  displayName: string;
  rosterNumber: number;
  /** The three secret words, for example maple-tiger-blue. */
  studentCode: string;
};

export type LoginSheet = {
  classCode: string;
  /** Where students sign in, for example https://app.example/s */
  loginUrlBase: string;
  students: LoginSheetStudent[];
};

export function issueCredentials(token: string, classId: string, studentIds: string[]): Promise<LoginSheet> {
  return apiFetch<LoginSheet>(`/classes/${encodeURIComponent(classId)}/credentials`, {
    method: "POST",
    token,
    body: { studentIds },
  });
}
