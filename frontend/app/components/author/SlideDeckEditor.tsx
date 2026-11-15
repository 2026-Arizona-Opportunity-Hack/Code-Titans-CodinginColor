"use client";
import { useId, useState } from "react";
import type { DocActivity } from "../../lib/api/curriculum";
import { DECK_ACCEPT, MAX_PDF_BYTES, MAX_PPTX_BYTES, toGoogleSlidesEmbed, uploadDeck } from "../../lib/slideDocument";
import { DocumentViewer } from "../common/DocumentViewer";

type Source = "upload" | "google" | "text";

/** What a slides step shows: typed slides, an uploaded PDF, or a Google Slides deck. */
export function SlideDeckEditor({ a, token, set }: { a: DocActivity; token: string; set: (patch: Partial<DocActivity>) => void }) {
  const id = useId();
  const typed = (a.slides ?? []).some((s) => (s.body ?? "").trim());
  const [source, setSource] = useState<Source>(a.document?.kind === "google" ? "google" : a.document ? "upload" : typed ? "text" : "upload");
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
      set({ document: await uploadDeck(token, file) });
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

  const options: [Source, string][] = [["upload", "Upload PDF or PowerPoint"], ["google", "Link Google Slides"], ["text", "Type the slides here"]];
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

      {source === "upload" ? (
        <div className="mt-3">
          <label htmlFor={`${id}-file`} className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-brand bg-tint px-4 py-6 text-center hover:bg-surface">
            <span className="font-bold text-brand">{a.document && a.document.kind !== "google" ? "Replace the slides file" : "Choose a slides file"}</span>
            <span id={`${id}-file-h`} className="text-sm text-muted">
              PDF up to {MAX_PDF_BYTES / 1024 / 1024} MB, or PowerPoint .pptx up to {MAX_PPTX_BYTES / 1024 / 1024} MB.
              Keynote: export as PDF. Old .ppt: save as .pptx.
            </span>
          </label>
          <input id={`${id}-file`} type="file" accept={DECK_ACCEPT} disabled={busy} aria-describedby={`${id}-file-h`}
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} className="sr-only" />
          {busy ? <p role="status" className="mt-2 font-bold text-muted">Uploading…</p> : null}
          {a.document && a.document.kind !== "google" && !busy ? <p className="mt-2 text-sm">Using <strong>{a.document.name ?? "the uploaded file"}</strong>.</p> : null}
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
      {source !== "text" && a.document && (source === "google") === (a.document.kind === "google") ? (
        <div className="mt-4">
          <p className="mb-2 text-sm font-bold">Preview</p>
          <DocumentViewer doc={a.document} title={`${a.title || "Slides"} preview`} />
        </div>
      ) : null}
    </div>
  );
}
