"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ApiError } from "../../lib/api/client";
import {
  commitRosterImport,
  previewRosterImport,
  type DuplicateNames,
  type RosterImportPreview as Preview,
  type RosterImportResult,
} from "../../lib/api/roster";
import { prepareRosterCsv, TEMPLATE_CSV } from "../../lib/rosterCsv";
import { StaffPage } from "../common/StaffPage";
import { RosterImportPreview } from "./RosterImportPreview";

type Step = "choose" | "preview" | "done";

const MAX_FILE_BYTES = 1024 * 1024; // refuse huge files before reading them
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`;
const fieldClass = "mt-1 w-full rounded-lg border-2 border-muted bg-surface px-3 py-2";

function messageFor(error: unknown) {
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}

function ImportBody({ token, classId }: { token: string; classId: string }) {
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const [step, setStep] = useState<Step>("choose");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [duplicateNames, setDuplicateNames] = useState<DuplicateNames>("create");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<RosterImportResult | null>(null);

  const prepared = useMemo(() => (text.trim() ? prepareRosterCsv(text) : null), [text]);
  const usable = prepared !== null && prepared.fatal === null && prepared.rowCount > 0;

  // Move focus to the heading of each new step, so keyboard and screen-reader users land on it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError("That file is too large. A roster file should be well under 1 MB.");
      return;
    }
    setError(null);
    setFileName(file.name);
    setText(await file.text());
  }

  async function runPreview() {
    if (!prepared || prepared.fatal) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewRosterImport(token, classId, { csv: prepared.csv, duplicateNames }));
      setStep("preview");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function runCommit() {
    if (!prepared || prepared.fatal) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await commitRosterImport(token, classId, { csv: prepared.csv, duplicateNames }));
      await Promise.all(
        ["class", "roster", "classes"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
      );
      setStep("done");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setText("");
    setFileName("");
    setPreview(null);
    setResult(null);
    setError(null);
    setStep("choose");
  }

  const fileProblems = prepared?.problems ?? [];
  const importable = preview ? preview.toCreate + preview.toUpdate : 0;
  // The server imports every valid row and skips the rest, so only an empty import is blocked.
  const blocked = !preview || importable === 0;
  const skippedRows = fileProblems.length + (preview?.errors.length ?? 0);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href={`/instructor/class/?id=${encodeURIComponent(classId)}`}>← Back to class</Link>
      </nav>

      {step === "choose" ? (
        <>
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl">
            Add students from a CSV
          </h1>
          <p className="mt-2 max-w-prose text-muted">
            One student per row. The only required column is <code className="font-mono">displayName</code>. Anything else
            in your file, like birthdates, is removed on your computer and never uploaded.
          </p>
          <p className="mt-3">
            <a href={TEMPLATE_HREF} download="roster-template.csv" className="font-bold">
              Download a template
            </a>
          </p>

          <div className="mt-6 max-w-xl">
            <label htmlFor="file" className="block font-bold">
              CSV file
            </label>
            <input id="file" type="file" accept=".csv,text/csv" onChange={onFile} className={fieldClass} />
            {fileName ? <p className="mt-1 text-sm text-muted">Chosen: {fileName}</p> : null}

            <label htmlFor="paste" className="mt-6 block font-bold">
              Or paste it here
            </label>
            <textarea
              id="paste"
              rows={6}
              value={text}
              onChange={(e) => {
                setFileName("");
                setText(e.target.value);
              }}
              spellCheck={false}
              className={`${fieldClass} font-mono`}
            />
          </div>

          {prepared?.fatal ? (
            <p role="alert" className="mt-4 max-w-xl rounded-lg border-2 border-danger p-3 font-bold text-danger">
              {prepared.fatal}
            </p>
          ) : null}

          {prepared && !prepared.fatal ? (
            <div role="status" className="mt-4 max-w-xl rounded-xl bg-tint p-4">
              <p className="font-bold text-brand">
                {prepared.rowCount} {prepared.rowCount === 1 ? "student" : "students"} ready to import
              </p>
              {prepared.strippedColumns.length > 0 ? (
                <p className="mt-1 text-sm">
                  Removed before sending: {prepared.strippedColumns.join(", ")}. These columns are never uploaded.
                </p>
              ) : null}
              {prepared.problems.length > 0 ? (
                <p className="mt-1 text-sm">
                  {prepared.problems.length} {prepared.problems.length === 1 ? "row will be" : "rows will be"} skipped (for
                  example row {prepared.problems[0].row}: {prepared.problems[0].reason}). The next step lists them all.
                </p>
              ) : null}
            </div>
          ) : null}

          <fieldset className="mt-6 max-w-xl">
            <legend className="font-bold">If a name is already in this class</legend>
            {(
              [
                ["create", "Add it as a new student and flag it for review (recommended)"],
                ["skip", "Skip it"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="mt-2 flex min-h-11 items-center gap-3">
                <input
                  type="radio"
                  name="duplicateNames"
                  value={value}
                  checked={duplicateNames === value}
                  onChange={() => setDuplicateNames(value)}
                  className="size-5 accent-brand"
                />
                {label}
              </label>
            ))}
          </fieldset>

          {error ? (
            <p role="alert" className="mt-4 max-w-xl rounded-lg border-2 border-danger p-3 font-bold text-danger">
              {error}
            </p>
          ) : null}

          <button type="button" className="btn btn-primary mt-6" disabled={!usable || busy} onClick={runPreview}>
            {busy ? "Checking…" : "Preview import"}
          </button>
        </>
      ) : null}

      {step === "preview" && preview ? (
        <>
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl">
            Check before importing
          </h1>
          <p className="mt-2 text-muted">Nothing has been saved yet.</p>
          <div className="mt-6 max-w-2xl">
            <RosterImportPreview preview={preview} fileProblems={fileProblems} />
          </div>

          {error ? (
            <p role="alert" className="mt-4 max-w-xl rounded-lg border-2 border-danger p-3 font-bold text-danger">
              {error}
            </p>
          ) : null}

          {skippedRows > 0 && importable > 0 ? (
            <p className="mt-6 max-w-prose text-muted">
              {skippedRows} {skippedRows === 1 ? "row" : "rows"} will be skipped. Everything else will be imported.
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => setStep("choose")} disabled={busy}>
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={runCommit} disabled={blocked || busy}>
              {busy ? "Importing…" : `Import ${importable} ${importable === 1 ? "student" : "students"}`}
            </button>
          </div>
        </>
      ) : null}

      {step === "done" ? (
        <>
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl">
            Import complete
          </h1>
          {result ? (
            <>
              <p role="status" className="mt-3 text-lg">
                Added {result.created} {result.created === 1 ? "student" : "students"}
                {result.updated > 0 ? ` and updated ${result.updated}` : ""}.
                {result.skipped + result.errors.length + fileProblems.length > 0
                  ? ` Skipped ${result.skipped + result.errors.length + fileProblems.length} ${
                      result.skipped + result.errors.length + fileProblems.length === 1 ? "row" : "rows"
                    }.`
                  : ""}
              </p>
              {result.possibleDuplicates.length > 0 ? (
                <p className="mt-2 max-w-prose text-muted">
                  Some names matched students already in the class. They were flagged so you can review them.
                </p>
              ) : null}
              {result.credentialsNeeded > 0 ? (
                <p className="callout mt-6 max-w-prose">
                  <span className="font-bold text-brand">
                    {result.credentialsNeeded} new {result.credentialsNeeded === 1 ? "student needs" : "students need"} login
                    words
                  </span>{" "}
                  before they can open their lessons. Creating them is the next step.
                </p>
              ) : null}
            </>
          ) : null}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={`/instructor/class/?id=${encodeURIComponent(classId)}`} className="btn btn-primary">
              Back to class
            </Link>
            <button type="button" className="btn btn-secondary" onClick={startOver}>
              Import another file
            </button>
          </div>
        </>
      ) : null}
    </>
  );
}

export function RosterImportWizard() {
  const classId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={["instructor", "cic_admin"]}>
      {({ token }) =>
        classId ? (
          <ImportBody token={token} classId={classId} />
        ) : (
          <p role="alert" className="rounded-lg border-2 border-danger p-4 text-danger">
            No class was chosen. Open this page from a class.
          </p>
        )
      }
    </StaffPage>
  );
}
