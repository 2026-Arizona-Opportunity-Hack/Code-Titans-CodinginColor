"use client";
import { useId, useState } from "react";
import type { DocActivity } from "../../lib/api/curriculum";
import { MAX_PDF_BYTES, toGoogleSlidesEmbed, uploadPdf } from "../../lib/slideDocument";
import { DocumentViewer } from "../common/DocumentViewer";

type Source = "text" | "pdf" | "google";

/** What a slides step shows: typed slides, an uploaded PDF, or a Google Slides deck. */
export function SlideDeckEditor({ a, token, set }: { a: DocActivity; token: string; set: (patch: Partial<DocActivity>) => void }) {
  const id = useId();
  const [source, setSource] = useState<Source>(a.document?.kind ?? "text");
  const [link, setLink] = useState(a.document?.kind === "google" ? a.document.url : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function choose(next: Source) {
    setSource(next);
    setError("");
    if (next === "text") set({ document: undefined });
  }

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

  function useLink() {
    const embed = toGoogleSlidesEmbed(link);
    if (!embed) return setError("That isn't a Google Slides link. Copy the link from Share or File > Share > Publish to the web.");
    setError("");
    set({ document: { kind: "google", url: embed } });
  }

  const options: [Source, string][] = [["text", "Type the slides here"], ["pdf", "Upload a PDF"], ["google", "Link Google Slides"]];
  return (
    <div className="mt-3">
      <fieldset>
        <legend className="font-bold">Slides come from</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {options.map(([value, label]) => (
            <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-bold ${source === value ? "border-brand bg-tint text-brand" : "border-line"}`}>
              <input type="radio" name={`${id}-src`} value={value} checked={source === value} onChange={() => choose(value)} className="size-4" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {source === "text" ? (
        <div className="mt-3">
          {(a.slides ?? []).map((s, i) => (
            <div key={i} className="mt-2">
              <label htmlFor={`${id}-s${i}`} className="block font-bold">Slide {i + 1}</label>
              <textarea id={`${id}-s${i}`} className="field mt-1" rows={2} value={s.body ?? ""} onChange={(e) => set({ slides: (a.slides ?? []).map((x, k) => (k === i ? { ...x, body: e.target.value } : x)) })} />
            </div>
          ))}
          <button type="button" className="btn btn-secondary mt-2" onClick={() => set({ slides: [...(a.slides ?? []), { body: "" }] })}>Add a slide</button>
        </div>
      ) : null}

      {source === "pdf" ? (
        <div className="mt-3">
          <label htmlFor={`${id}-pdf`} className="block font-bold">PDF file</label>
          <p id={`${id}-pdf-h`} className="text-sm text-muted">
            Export your deck as a PDF (PowerPoint, Keynote and Google Slides all can), up to {MAX_PDF_BYTES / 1024 / 1024} MB.
          </p>
          <input id={`${id}-pdf`} type="file" accept="application/pdf" disabled={busy} aria-describedby={`${id}-pdf-h`}
            onChange={(e) => onFile(e.target.files?.[0])} className="mt-1 block text-sm" />
          {busy ? <p role="status" className="mt-2 text-muted">Uploading…</p> : null}
        </div>
      ) : null}

      {source === "google" ? (
        <div className="mt-3">
          <label htmlFor={`${id}-g`} className="block font-bold">Google Slides link</label>
          <p id={`${id}-g-h`} className="text-sm text-muted">
            In Google Slides use Share and set it to &ldquo;Anyone with the link&rdquo;, or File &gt; Share &gt; Publish to the web. Paste the link here.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <input id={`${id}-g`} type="url" className="field min-w-0 flex-1" value={link} onChange={(e) => setLink(e.target.value)} aria-describedby={`${id}-g-h`} placeholder="https://docs.google.com/presentation/d/…" />
            <button type="button" className="btn btn-secondary" onClick={useLink} disabled={!link.trim()}>Use this link</button>
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="mt-2 font-bold text-danger">{error}</p> : null}
      {source !== "text" && a.document?.kind === source ? (
        <div className="mt-4">
          <p className="mb-2 text-sm font-bold">Preview</p>
          <DocumentViewer doc={a.document} title={`${a.title || "Slides"} preview`} />
        </div>
      ) : null}
    </div>
  );
}
