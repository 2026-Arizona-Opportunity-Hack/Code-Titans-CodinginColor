"use client";

import Image from "next/image";
import Link from "next/link";
import { useWho } from "../../lib/useWho";

/**
 * The Coding in Color logo and name, shown in every header. It links to the person's own home page: the
 * dashboard for signed-in staff, the learning path for a signed-in student, and the public home page for visitors.
 *
 * The logo is used as supplied (public/brand/cic-logo.png) and follows the brand
 * guide: never stretched or recolored, no effects added, shown on white, never
 * smaller than 24px (here 40px tall). If CIC provides a version without the soft
 * shadow baked into this image, replace the file and nothing else changes.
 */
export function BrandMark({ href }: { href?: string }) {
  const who = useWho();
  return (
    <Link
      href={href ?? who.home}
      aria-label={who.kind === "none" ? "Coding in Color Learn, home" : "Coding in Color Learn, your home page"}
      className="inline-flex items-center gap-3 no-underline"
    >
      <Image src="/brand/cic-logo.png" alt="" width={394} height={308} priority className="h-10 w-auto" />
      <span className="flex flex-col leading-none">
        <span className="whitespace-nowrap text-[1.0625rem] font-bold tracking-tight text-brand">Coding in Color</span>
        <span className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-muted">Learn</span>
      </span>
    </Link>
  );
}
