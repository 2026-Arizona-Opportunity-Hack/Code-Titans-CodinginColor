"use client";
import { useId, useState } from "react";
import type { DocActivity } from "../../lib/api/curriculum";
import { MAX_PDF_BYTES, uploadPdf } from "../../lib/slideDocument";
import { DocumentViewer } from "../common/DocumentViewer";

/** Optional: the original printed worksheet as a PDF, shown to students above the answer fields. */
export function WorksheetDocumentPicker({ a, token, set }: { a: DocActivity; token: string; set: (patch: Partial<DocActivity>) => void }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      set({ document: await uploadPdf(token, file) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The upload didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      <p className="font-bold">Original worksheet <span className="font-normal text-muted">(optional)</span></p>
      <p id={`${id}-h`} className="text-sm text-muted">
        Upload the printed worksheet as a PDF (up to {MAX_PDF_BYTES / 1024 / 1024} MB). Students see it above the answer boxes.
      </p>
      {a.document ? (
        <div className="mt-2">
          <DocumentViewer doc={a.document} title={`${a.title || "Worksheet"}: original worksheet`} />
          <button type="button" className="btn btn-secondary mt-2" onClick={() => set({ document: undefined })}>Remove the PDF</button>
        </div>
      ) : (
        <>
          <label htmlFor={`${id}-file`} className="sr-only">Worksheet PDF</label>
          <input id={`${id}-file`} type="file" accept="application/pdf" disabled={busy} aria-describedby={`${id}-h`}
            onChange={(e) => onFile(e.target.files?.[0])} className="mt-2 block text-sm" />
        </>
      )}
      {busy ? <p role="status" className="mt-2 text-muted">Uploading…</p> : null}
      {error ? <p role="alert" className="mt-2 font-bold text-danger">{error}</p> : null}
    </div>
  );
}
