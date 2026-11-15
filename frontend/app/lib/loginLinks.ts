import Papa from "papaparse";
import type { LoginSheet, LoginSheetStudent } from "./api/credentials";

/**
 * A student's personal link: https://<app>/s/#<classCode>.<words>
 * The secret sits in the URL fragment, which is never sent to a server. The entry page
 * reads it and removes it from the address bar (docs/architecture.md section 5).
 */
export function studentLink(sheet: LoginSheet, student: LoginSheetStudent, origin: string): string {
  const base = sheet.loginUrlBase.startsWith("/") ? origin + sheet.loginUrlBase : sheet.loginUrlBase;
  return `${base.replace(/\/$/, "")}/#${sheet.classCode}.${student.studentCode}`;
}

// Spreadsheets run text that starts with = + - @ as a formula, so exported cells are prefixed
// (docs/architecture.md section 10). Student names come from the instructor's own file.
const FORMULA_START = /^[=+\-@\t\r]/;
export const safeCell = (value: string) => (FORMULA_START.test(value) ? `'${value}` : value);

/** Name, number and link for each student, for a teacher who wants to mail-merge. It contains secrets. */
export function linksCsv(sheet: LoginSheet, origin: string): string {
  return Papa.unparse(
    {
      fields: ["displayName", "rosterNumber", "link"],
      data: sheet.students.map((s) => [safeCell(s.displayName), String(s.rosterNumber), studentLink(sheet, s, origin)]),
    },
    { newline: "\n" },
  );
}
