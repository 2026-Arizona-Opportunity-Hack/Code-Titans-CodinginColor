// A slide deck shown in a slides step instead of typed slides: an uploaded PDF or PowerPoint, or Google Slides.
import { apiFetch } from "./api/client";

export type SlideDocument = { kind: "pdf" | "pptx" | "google"; url: string; name?: string };

export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_PPTX_BYTES = 10 * 1024 * 1024; // the limit of Microsoft's online viewer
export const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
/** For <input type="file" accept=…>: PDFs and PowerPoint .pptx files. */
export const DECK_ACCEPT = `application/pdf,.pdf,${PPTX_TYPE},.pptx`;

/**
 * Turn any Google Slides link a teacher pastes into its embed form, or null if it is not a
 * Slides link. Accepts "Publish to the web" links (/d/e/<id>/pub or /embed) and normal share
 * links (/d/<id>/edit, /view, /present). Shared decks must be set to "Anyone with the link".
 */
export function toGoogleSlidesEmbed(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") return null;
  const published = url.pathname.match(/^\/presentation\/d\/e\/([A-Za-z0-9_-]{20,})\//);
  if (published) return `https://docs.google.com/presentation/d/e/${published[1]}/embed?start=false&loop=false`;
  const shared = url.pathname.match(/^\/presentation\/d\/([A-Za-z0-9_-]{20,})(\/|$)/);
  if (shared) return `https://docs.google.com/presentation/d/${shared[1]}/embed?start=false&loop=false`;
  return null;
}

type UploadForm = { uploadUrl: string; fields: Record<string, string>; assetUrl: string };

/** Which kind of deck a chosen file is, by type or by name (some computers send no type for .pptx). */
export function deckKind(file: File): "pdf" | "pptx" | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type === PPTX_TYPE || name.endsWith(".pptx")) return "pptx";
  return null;
}

/** Upload a PDF or PowerPoint deck straight to storage with a signed form, and return where it is served from. */
export async function uploadDeck(token: string, file: File): Promise<SlideDocument> {
  const kind = deckKind(file);
  if (!kind) {
    throw new Error(file.name.toLowerCase().endsWith(".ppt")
      ? "Old .ppt files can't be shown. In PowerPoint use Save As and choose .pptx or PDF."
      : "Choose a PDF or a PowerPoint (.pptx) file.");
  }
  const limit = kind === "pdf" ? MAX_PDF_BYTES : MAX_PPTX_BYTES;
  if (file.size > limit) throw new Error(`That file is larger than ${limit / 1024 / 1024} MB. Export a smaller file, or save it as a PDF.`);
  const contentType = kind === "pdf" ? "application/pdf" : PPTX_TYPE;
  const form = await apiFetch<UploadForm>("/curriculum/assets/upload-url", {
    method: "POST",
    token,
    body: { contentType, size: file.size },
  });
  const body = new FormData();
  Object.entries(form.fields).forEach(([k, v]) => body.append(k, v));
  body.append("file", new Blob([file], { type: contentType })); // S3 checks the type matches the signed form
  const res = await fetch(form.uploadUrl, { method: "POST", body });
  if (!res.ok) throw new Error("The upload didn't finish. Check your connection and try again.");
  return { kind, url: form.assetUrl, name: file.name.slice(0, 200) };
}

/** Kept for the worksheet picker, which takes PDFs only. */
export async function uploadPdf(token: string, file: File): Promise<SlideDocument> {
  if (deckKind(file) !== "pdf") throw new Error("Choose a PDF file.");
  return uploadDeck(token, file);
}
