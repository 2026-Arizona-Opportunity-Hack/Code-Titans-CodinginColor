import type { ReactNode } from "react";

// A small, safe markdown subset for lesson text: paragraphs, "- " lists, **bold**, *italic*,
// `code` and [links](https://...). Everything becomes React text nodes, never HTML, and only
// http(s) links are allowed, so author-written text cannot inject markup or scripts
// (docs/architecture.md section 8).
const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return <code key={i} className="rounded bg-tint px-1.5 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (link) return <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]} <span className="sr-only">(opens in a new tab)</span></a>;
    return part;
  });
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return <ul key={i} className="my-3 list-disc pl-6">{lines.map((l, k) => <li key={k}>{inline(l.replace(/^\s*[-*] /, ""))}</li>)}</ul>;
        }
        return <p key={i} className="my-3 whitespace-pre-line">{inline(block)}</p>;
      })}
    </div>
  );
}
