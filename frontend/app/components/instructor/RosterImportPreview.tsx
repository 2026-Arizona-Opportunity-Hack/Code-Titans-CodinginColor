import type { RosterImportPreview as Preview } from "../../lib/api/roster";

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

/** What the server says an import would do. Nothing is saved yet (this is the dry run). */
export function RosterImportPreview({ preview }: { preview: Preview }) {
  return (
    <>
      <dl className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-sm text-muted">New students</dt>
          <dd className="mt-1 text-3xl font-bold text-brand">{preview.toCreate}</dd>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <dt className="text-sm text-muted">Existing students updated</dt>
          <dd className="mt-1 text-3xl font-bold text-brand">{preview.toUpdate}</dd>
        </div>
      </dl>

      {preview.errors.length > 0 ? (
        <section role="alert" className="mt-6 rounded-xl border-2 border-danger p-4">
          <h3 className="font-bold text-danger">
            {preview.errors.length} {preview.errors.length === 1 ? "row has a problem" : "rows have problems"}
          </h3>
          <p className="text-sm text-muted">Fix these in your file, then choose it again. Row 1 is the first student.</p>
          <RowList items={preview.errors.map((e) => ({ row: e.row, text: e.reason }))} />
        </section>
      ) : null}

      {preview.possibleDuplicates.length > 0 ? (
        <section className="mt-6 rounded-xl border-l-8 border-accent bg-tint p-4">
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
