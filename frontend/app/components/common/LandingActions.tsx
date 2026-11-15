"use client";

import Link from "next/link";
import { useWho, type Who } from "../../lib/useWho";
import { Icon } from "./Icon";

/** What a signed-in person is offered on the public home page, instead of the sign-in buttons. */
function signedInLabel(who: Who): string {
  if (who.kind === "student") return "Continue my lesson";
  if (who.kind === "staff" && who.role === "reviewer") return "Open the curriculum";
  return "Go to your classes";
}

/** The two buttons in the page header. */
export function LandingNav() {
  const who = useWho();
  if (who.kind !== "none") {
    return (
      <Link href={who.home} className="btn btn-primary btn-sm">
        {signedInLabel(who)}
      </Link>
    );
  }
  return (
    <>
      <Link href="/login/" className="btn btn-ghost btn-sm">
        Teacher sign in
      </Link>
      <Link href="/s/" className="btn btn-primary btn-sm">
        Open my lesson
      </Link>
    </>
  );
}

/** The big buttons in the hero. */
export function HeroCtas() {
  const who = useWho();
  if (who.kind !== "none") {
    return (
      <Link href={who.home} className="btn btn-primary !min-h-12 px-7 text-base">
        {signedInLabel(who)}
        <Icon name="arrowRight" />
      </Link>
    );
  }
  return (
    <>
      <Link href="/s/" className="btn btn-primary !min-h-12 px-7 text-base">
        Open my lesson
        <Icon name="arrowRight" />
      </Link>
      <Link href="/login/" className="btn btn-secondary !min-h-12 px-7 text-base">
        Teacher or staff sign in
      </Link>
    </>
  );
}

/** The button in the green band at the bottom. */
export function FinalCta() {
  const who = useWho();
  const href = who.kind === "none" ? "/s/" : who.home;
  return (
    <Link href={href} className="btn !min-h-12 bg-white px-7 text-base text-brand hover:!bg-tint hover:!text-brand-hover">
      {who.kind === "none" ? "Open my lesson" : signedInLabel(who)}
      <Icon name="arrowRight" />
    </Link>
  );
}
