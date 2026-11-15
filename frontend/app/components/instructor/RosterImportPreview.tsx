import type { RosterImportPreview as Preview } from "../../lib/api/roster";
import type { CsvProblem } from "../../lib/rosterCsv";

const SHOWN = 10;

function RowList({ items }: { items: { row: number; text: string }[] }) {
  return (
    <ul className="mt-2 list-disc pl-6">
      {items.slice(0, SHOWN).map((item) => (
        <li key={`${item.row}-${item.text}`}>
          Row {item.row}: {item.text}
        </li>
      ))}
      {items.length > SHOWN ? <li>…and {items.length - SHOWN} more</li> : null}
    </ul>
  );
}

/**
 * What an import would do. Nothing is saved yet (this is the dry run).
 * `fileProblems` are rows found in the instructor's own file; they were left out of what
 * was sent, so they are skipped. The server's own problems count rows of the cleaned file.
 */
export function RosterImportPreview({ preview, fileProblems }: { preview: Preview; fileProblems: CsvProblem[] }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-4">
        <div className="card">
          <dt className="text-sm text-muted">New students</dt>
          <dd className="mt-1 text-3xl font-bold text-brand">{preview.toCreate}</dd>
        </div>
        <div className="card">
          <dt className="text-sm text-muted">Existing students updated</dt>
          <dd className="mt-1 text-3xl font-bold text-brand">{preview.toUpdate}</dd>
        </div>
      </dl>

      {fileProblems.length > 0 ? (
        <section role="alert" className="callout callout-danger mt-6">
          <h3 className="font-bold text-danger">
            {fileProblems.length} {fileProblems.length === 1 ? "row in your file will" : "rows in your file will"} be skipped
          </h3>
          <p className="text-sm text-muted">
            Fix them in your file and import again if you want them added. Row 1 is the first student.
          </p>
          <RowList items={fileProblems.map((p) => ({ row: p.row, text: p.reason }))} />
        </section>
      ) : null}

      {preview.errors.length > 0 ? (
        <section role="alert" className="callout callout-danger mt-6">
          <h3 className="font-bold text-danger">
            The server can&apos;t import {preview.errors.length} more {preview.errors.length === 1 ? "row" : "rows"}
          </h3>
          <p className="text-sm text-muted">Row numbers here count only the rows that were sent.</p>
          <RowList items={preview.errors.map((e) => ({ row: e.row, text: e.reason }))} />
        </section>
      ) : null}

      {preview.possibleDuplicates.length > 0 ? (
        <section className="callout mt-6">
          <h3 className="font-bold text-brand">Names that are already in this class</h3>
          <p className="text-sm text-muted">
            These will be added as separate students and flagged so you can review them. Two students can share a name.
          </p>
          <RowList items={preview.possibleDuplicates.map((d) => ({ row: d.row, text: d.displayName }))} />
        </section>
      ) : null}

      {preview.ignoredColumns.length > 0 ? (
        <p className="mt-6 text-sm text-muted">
          Columns the server ignored and did not store: {preview.ignoredColumns.join(", ")}.
        </p>
      ) : null}
    </>
  );
}
