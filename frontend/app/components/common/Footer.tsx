import Image from "next/image";
import Link from "next/link";

const NONPROFIT = "A 501(c)(3) nonprofit";

/**
 * The page footer. Staff and student screens use the one-line version. The public home page
 * passes `full` for the larger one with CIC's horizontal logo and the ways in.
 */
export function Footer({ full = false }: { full?: boolean }) {
  if (!full) {
    return (
      <footer className="border-t border-hairline bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-5 text-sm text-muted">
          <p>
            <span className="font-bold text-ink">Coding in Color</span> · Developing the future digital workforce in
            Arizona.
          </p>
          <p>{NONPROFIT}</p>
        </div>
      </footer>
    );
  }
  return (
    <footer className="border-t border-hairline bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Image src="/brand/cic-lockup.png" alt="Coding in Color" width={1200} height={314} className="h-14 w-auto" />
          <p className="mt-4 max-w-sm text-muted">Developing the future digital workforce in Arizona through computer science and AI education.</p>
        </div>
        <nav aria-label="For students and families">
          <h2 className="!text-sm uppercase tracking-wider !text-ink">Students</h2>
          <ul className="mt-3 flex flex-col gap-2">
            <li><Link href="/s/">Open my lesson</Link></li>
          </ul>
        </nav>
        <nav aria-label="For teachers">
          <h2 className="!text-sm uppercase tracking-wider !text-ink">Teachers</h2>
          <ul className="mt-3 flex flex-col gap-2">
            <li><Link href="/login/">Teacher or staff sign in</Link></li>
            <li><Link href="/request-access/">Request a teacher account</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-hairline">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-muted">
          <p>© Coding in Color. {NONPROFIT}.</p>
          <p>No student emails, birthdates or addresses are collected.</p>
        </div>
      </div>
    </footer>
  );
}
