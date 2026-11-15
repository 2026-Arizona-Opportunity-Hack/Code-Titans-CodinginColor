import Papa from "papaparse";

// Cleans a roster CSV in the browser before it is sent (docs/api.md section 4).
// Only displayName and, if present, externalId are kept. Every other column (a
// birthdate in a school export, for example) is removed here, so data the platform
// does not need never leaves the instructor's computer. The server also ignores
// extra columns, but it is better that they are never sent.
//
// Rows that cannot be imported are left OUT of the file that is sent and reported here
// instead, with their position in the instructor's file. The server skips blank lines,
// so a row with no name (a blank line in a one-column file) could never be reported by it.
// The checks below match the server's own (backend/lambda/class-api/roster_import.py).

export const MAX_ROWS = 500;
export const MAX_NAME_LENGTH = 100;
export const MAX_EXTERNAL_ID_LENGTH = 64;
export const MAX_BYTES = 256 * 1024; // request bodies are capped at 256 KB (api.md)

/** A file the instructor can download and fill in. displayName is the only required column. */
export const TEMPLATE_CSV = "displayName\nAna R.\nBen T.\n";

export type CsvProblem = { row: number; reason: string };

export type PreparedRoster = {
  /** The cleaned CSV to send, containing only the rows that can be imported. */
  csv: string;
  /** How many rows will be sent (the rows without problems). */
  rowCount: number;
  hasExternalId: boolean;
  /** Column names that were removed. */
  strippedColumns: string[];
  /** Rows that will be skipped. Row 1 is the first student, below the header row. */
  problems: CsvProblem[];
  /** A problem that stops the import entirely, in plain words. Null when the file is usable. */
  fatal: string | null;
};

// "displayName", "Display Name" and "display_name" are the same column.
const canon = (header: string) => header.trim().toLowerCase().replace(/[\s_-]+/g, "");

const hasControlCharacter = (text: string) => [...text].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

function failed(fatal: string): PreparedRoster {
  return { csv: "", rowCount: 0, hasExternalId: false, strippedColumns: [], problems: [], fatal };
}

export function prepareRosterCsv(text: string): PreparedRoster {
  const rows = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" }).data;
  if (rows.length === 0) return failed("The file is empty.");

  const header = rows[0].map((cell) => (cell ?? "").trim());
  const nameIndex = header.findIndex((h) => canon(h) === "displayname");
  if (nameIndex === -1) {
    return failed("The file needs a column named displayName. Download the template to see the format.");
  }
  const idIndex = header.findIndex((h) => canon(h) === "externalid");
  const strippedColumns = header.filter((h, i) => h && i !== nameIndex && i !== idIndex);

  const students = rows.slice(1);
  if (students.length === 0) return failed("The file has a header row but no students.");
  if (students.length > MAX_ROWS) {
    return failed(`The file has ${students.length} students. The limit is ${MAX_ROWS} per file, so split it into smaller files.`);
  }

  const problems: CsvProblem[] = [];
  const seenIds = new Set<string>();
  const data: string[][] = [];
  students.forEach((cells, i) => {
    const row = i + 1;
    const name = (cells[nameIndex] ?? "").trim();
    const externalId = idIndex === -1 ? "" : (cells[idIndex] ?? "").trim();
    let reason: string | null = null;
    if (!name) reason = "displayName is empty";
    else if (name.length > MAX_NAME_LENGTH || hasControlCharacter(name)) {
      reason = `displayName must be plain text up to ${MAX_NAME_LENGTH} characters`;
    } else if (externalId.length > MAX_EXTERNAL_ID_LENGTH || hasControlCharacter(externalId)) {
      reason = `externalId must be plain text up to ${MAX_EXTERNAL_ID_LENGTH} characters`;
    } else if (externalId && seenIds.has(externalId)) {
      reason = "externalId appears more than once in the file";
    }
    if (reason) {
      problems.push({ row, reason });
      return;
    }
    if (externalId) seenIds.add(externalId);
    data.push(idIndex === -1 ? [name] : [name, externalId]);
  });

  const fields = idIndex === -1 ? ["displayName"] : ["displayName", "externalId"];
  const csv = Papa.unparse({ fields, data }, { newline: "\n" });
  if (new TextEncoder().encode(csv).length > MAX_BYTES) {
    return failed("The file is too large. Split it into smaller files.");
  }

  return { csv, rowCount: data.length, hasExternalId: idIndex !== -1, strippedColumns, problems, fatal: null };
}
