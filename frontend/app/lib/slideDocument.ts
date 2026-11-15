// A slide deck shown in a slides step instead of typed slides: an uploaded PDF, or Google Slides.
import { apiFetch } from "./api/client";

export type SlideDocument = { kind: "pdf" | "google"; url: string; name?: string };

export const MAX_PDF_BYTES = 20 * 1024 * 1024;

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

/** Upload a PDF straight to storage with a signed form, and return where it is served from. */
export async function uploadPdf(token: string, file: File): Promise<SlideDocument> {
  if (file.type !== "application/pdf") throw new Error("Choose a PDF file.");
  if (file.size > MAX_PDF_BYTES) throw new Error("That PDF is larger than 20 MB. Export a smaller file and try again.");
  const form = await apiFetch<UploadForm>("/curriculum/assets/upload-url", {
    method: "POST",
    token,
    body: { contentType: "application/pdf", size: file.size },
  });
  const body = new FormData();
  Object.entries(form.fields).forEach(([k, v]) => body.append(k, v));
  body.append("file", file);
  const res = await fetch(form.uploadUrl, { method: "POST", body });
  if (!res.ok) throw new Error("The upload didn't finish. Check your connection and try again.");
  return { kind: "pdf", url: form.assetUrl, name: file.name.slice(0, 200) };
}
