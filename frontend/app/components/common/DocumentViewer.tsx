"use client";
import type { SlideDocument } from "../../lib/slideDocument";

/**
 * Shows a slide deck inside the page: Google Slides through Google's own player, and PDFs
 * through the browser's built-in PDF viewer (Chrome, Edge, Firefox, Safari and Chromebooks
 * all have one). A link opens the deck full size, which also helps on small phones.
 */
export function DocumentViewer({ doc, title }: { doc: SlideDocument; title: string }) {
  const google = doc.kind === "google";
  return (
    <div>
      <div className={google ? "aspect-video" : "h-[75vh] min-h-96"}>
        <iframe
          src={google ? doc.url : `${doc.url}#view=FitH`}
          title={title}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full rounded-xl border border-line bg-tint"
        />
      </div>
      <p className="mt-2 text-sm">
        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">
          Open {google ? "the slides" : doc.name ? `“${doc.name}”` : "the PDF"} in a new tab
        </a>
        <span className="text-muted"> · best on a phone</span>
      </p>
    </div>
  );
}
