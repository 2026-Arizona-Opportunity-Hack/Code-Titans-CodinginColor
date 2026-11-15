"use client";

import Image from "next/image";
import Link from "next/link";
import { useWho } from "../../lib/useWho";

/**
 * The Coding in Color logo and name, shown in every header. It links to the person's own home page: the
 * dashboard for signed-in staff, the learning path for a signed-in student, and the public home page for visitors.
 *
 * The bracket mark (public/brand/cic-mark.png) is CIC's own artwork, cut from the supplied
 * logo with its white background made transparent. Colors are unchanged and it is never
 * stretched or recolored. It is 40px tall, above the guide's 24px minimum. The words next
 * to it are text, so they stay sharp and readable at any zoom.
 */
export function BrandMark({ href }: { href?: string }) {
  const who = useWho();
  return (
    <Link
      href={href ?? who.home}
      aria-label={who.kind === "none" ? "Coding in Color Learn, home" : "Coding in Color Learn, your home page"}
      className="inline-flex items-center gap-3 no-underline"
    >
      <Image src="/brand/cic-mark.png" alt="" width={640} height={659} priority className="h-11 w-auto" />
      <span className="flex flex-col leading-none">
        <span className="whitespace-nowrap text-[1.0625rem] font-bold tracking-tight text-brand">Coding in Color</span>
        <span className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-muted">Learn</span>
      </span>
    </Link>
  );
}
