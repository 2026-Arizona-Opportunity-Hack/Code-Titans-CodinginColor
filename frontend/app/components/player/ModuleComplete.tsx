"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getStudentHome } from "../../lib/api/student";
import { Icon } from "../common/Icon";
import { moduleHref } from "./ModuleTrail";

/** Shown when the last step of a module is done: a clear finish, and the next module if one opened. */
export function ModuleComplete({ title, unlockedId, token }: { title: string; unlockedId: string | null; token: string }) {
  const home = useQuery({
    queryKey: ["student", "home", token],
    queryFn: ({ signal }) => getStudentHome(token, signal),
    enabled: Boolean(unlockedId),
    retry: false,
  });
  const unlockedTitle = home.data?.modules.find((m) => m.moduleId === unlockedId)?.title;

  return (
    <section aria-labelledby="done-heading" className="callout rise p-8 text-center">
      <span aria-hidden="true" className="mx-auto grid size-16 place-items-center rounded-full bg-brand text-on-brand">
        <Icon name="check" className="size-8" />
      </span>
      <h1 id="done-heading" tabIndex={-1} className="mt-4">
        You finished {title}!
      </h1>
      {unlockedId ? (
        <p className="mt-3 text-lg text-muted">
          <span className="font-bold text-brand">{unlockedTitle ?? "The next module"}</span> is now open.
        </p>
      ) : (
        <p className="mt-3 text-lg text-muted">Great work. That&apos;s everything assigned for now.</p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {unlockedId ? (
          <Link href={moduleHref(unlockedId)} className="btn btn-primary">
            Start {unlockedTitle ?? "the next module"}
          </Link>
        ) : null}
        <Link href="/student/" className={unlockedId ? "btn btn-secondary" : "btn btn-primary"}>
          Back to your path
        </Link>
      </div>
    </section>
  );
}
