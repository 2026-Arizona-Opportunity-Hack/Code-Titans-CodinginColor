"use client";
import type { SlideDocument } from "../../lib/slideDocument";

/**
 * Shows a slide deck inside the page: Google Slides through Google's own player, PowerPoint
 * through Microsoft's free online viewer, and PDFs through the browser's built-in PDF viewer
 * (Chrome, Edge, Firefox, Safari and Chromebooks all have one). A link opens the deck full
 * size, which also helps on small phones.
 */
export function DocumentViewer({ doc, title }: { doc: SlideDocument; title: string }) {
  const google = doc.kind === "google";
  const pptx = doc.kind === "pptx";
  const src = google ? doc.url : pptx ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(doc.url)}` : `${doc.url}#view=FitH`;
  const label = google ? "the slides" : doc.name ? `“${doc.name}”` : pptx ? "the slides" : "the PDF";
  return (
    <div>
      <div className={google || pptx ? "aspect-video min-h-72" : "h-[75vh] min-h-96"}>
        <iframe
          src={src}
          title={title}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full w-full rounded-xl border border-line bg-tint"
        />
      </div>
      <p className="mt-2 text-sm">
        <a href={pptx ? src.replace("/embed.aspx", "/view.aspx") : doc.url} target="_blank" rel="noopener noreferrer" className="font-bold underline underline-offset-2">
          Open {label} in a new tab
        </a>
        <span className="text-muted"> · best on a phone</span>
      </p>
    </div>
  );
}
