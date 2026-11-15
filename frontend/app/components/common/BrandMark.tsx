import Image from "next/image";
import Link from "next/link";

/**
 * The Coding in Color logo and name, shown in every header.
 *
 * The logo is used as supplied (public/brand/cic-logo.png) and follows the brand
 * guide: never stretched or recolored, no effects added, shown on white, never
 * smaller than 24px (here 44px tall). If CIC provides a version without the soft
 * shadow baked into this image, replace the file and nothing else changes.
 */
export function BrandMark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} aria-label="Coding in Color Learn, home" className="inline-flex items-center gap-3 no-underline">
      <Image src="/brand/cic-logo.png" alt="" width={394} height={308} priority className="h-11 w-auto" />
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-bold text-brand">Coding in Color</span>
        <span className="text-sm font-semibold text-muted">Learn</span>
      </span>
    </Link>
  );
}
