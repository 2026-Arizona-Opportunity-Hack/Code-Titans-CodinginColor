import Link from "next/link";

/**
 * Text wordmark shown in every header.
 *
 * PLACEHOLDER: the official logo files are in CIC's brand album (linked from the
 * Brand Guidelines PDF) and are not in this repo yet. When they are added, render
 * the logo image here, following the guide: keep clear space equal to the height
 * of the "C" on all sides, never render the icon below 24px, never recolor,
 * stretch or add shadows, and place it on white or dark green only.
 */
export function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Coding in Color Learn, home"
      className="inline-flex items-center gap-2 font-bold text-brand no-underline hover:text-brand-hover"
    >
      <span className="text-lg">Coding in Color</span>
      <span aria-hidden="true" className="h-5 w-px bg-line" />
      <span className="text-base text-muted">Learn</span>
    </Link>
  );
}
