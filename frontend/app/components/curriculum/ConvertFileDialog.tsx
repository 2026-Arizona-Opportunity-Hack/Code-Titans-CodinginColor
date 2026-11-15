"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "../../lib/api/client";
import { DECK_ACCEPT, uploadDeck } from "../../lib/slideDocument";

type Job = { jobId: string; status: "working" | "done" | "failed"; moduleId?: string | null; error?: string | null };
const MAX_AI_PDF = 4.5 * 1024 * 1024;

/** Upload a worksheet or slide deck; the AI drafts a module the author then edits and publishes. */
export function ConvertFileDialog({ token }: { token: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const [stage, setStage] = useState<"pick" | "uploading" | "drafting" | "failed">("pick");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const cancelled = useRef(false);

  useEffect(() => {
    if (stage !== "drafting") return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [stage]);

  const open = () => { cancelled.current = false; setStage("pick"); setError(""); setSeconds(0); dialog.current?.showModal(); };
  const close = () => { cancelled.current = true; dialog.current?.close(); };

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    if (file.name.toLowerCase().endsWith(".pdf") && file.size > MAX_AI_PDF) {
      setError("That PDF is larger than 4.5 MB, the most the AI can read at once. Export a smaller one, or split it.");
      return;
    }
    try {
      setStage("uploading");
      const doc = await uploadDeck(token, file);
      setStage("drafting");
      const job = await apiFetch<Job>("/curriculum/modules/from-file", { method: "POST", token, body: { fileUrl: doc.url } });
      for (let i = 0; i < 60 && !cancelled.current; i++) { // up to about 3 minutes
        await new Promise((r) => setTimeout(r, 3000));
        const now = await apiFetch<Job>(`/curriculum/conversions/${job.jobId}`, { token });
        if (now.status === "done" && now.moduleId) {
          qc.invalidateQueries({ queryKey: ["author-modules", token] });
          router.push(`/author/edit/?id=${encodeURIComponent(now.moduleId)}&drafted=1`);
          return;
        }
        if (now.status === "failed") throw new Error(now.error ?? "The AI couldn't draft a module from that file.");
      }
      if (!cancelled.current) throw new Error("This is taking longer than usual. Check Curriculum in a minute: the draft appears there when it's ready.");
    } catch (e) {
      setStage("failed");
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Something went wrong. Try again.");
    }
  }

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={open}>Draft from a file (AI)</button>
      <dialog ref={dialog} aria-labelledby="convert-h" onCancel={() => { cancelled.current = true; }}
        className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl border border-line p-6 shadow-xl backdrop:bg-black/40">
        <h2 id="convert-h" className="text-xl">Draft a module from a worksheet or slides</h2>
        <p className="mt-2 text-sm text-muted">
          Upload a printed worksheet (scanned or exported as PDF) or a slide deck (PDF or PowerPoint). The AI drafts a full module
          from it: pretest, the slides, a video placeholder, check questions, a worksheet, an exit question and a post-test.
          You review and edit everything before students see it.
        </p>
        {stage === "pick" || stage === "failed" ? (
          <>
            <label htmlFor="convert-file" className="mt-4 flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-brand bg-tint px-4 py-6 text-center hover:bg-surface">
              <span className="font-bold text-brand">Choose a PDF or PowerPoint</span>
              <span className="text-sm text-muted">PDF up to 4.5 MB, or .pptx up to 10 MB</span>
            </label>
            <input id="convert-file" type="file" accept={DECK_ACCEPT} className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </>
        ) : (
          <div role="status" className="mt-5 flex items-center gap-3">
            <span aria-hidden="true" className="inline-block size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            <span>{stage === "uploading" ? "Uploading your file…" : `The AI is drafting your module… ${seconds}s (usually 20 to 60 seconds)`}</span>
          </div>
        )}
        {error ? <p role="alert" className="mt-3 font-bold text-danger">{error}</p> : null}
        <div className="mt-6 flex justify-end">
          <button type="button" className="btn btn-secondary" onClick={close}>{stage === "drafting" ? "Hide (keep drafting)" : "Cancel"}</button>
        </div>
      </dialog>
    </>
  );
}
