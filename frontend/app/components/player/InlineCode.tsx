import type { ReactNode } from "react";

/**
 * Shows lesson text with `backtick code` styled as code. Everything is rendered as plain
 * text nodes, never as HTML, so author-written text cannot inject markup
 * (docs/architecture.md section 8: markdown only, no raw HTML).
 */
export function InlineCode({ text }: { text: string }): ReactNode {
  return text.split("`").map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className="rounded bg-tint px-1.5 py-0.5 font-mono text-[0.9em]">
        {part}
      </code>
    ) : (
      part
    ),
  );
}
