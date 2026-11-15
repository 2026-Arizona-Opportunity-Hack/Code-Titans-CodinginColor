"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { getStudentHome } from "../../lib/api/student";
import { Icon } from "../common/Icon";
import { moduleHref } from "./ModuleTrail";

/**
 * Shown on an earlier module a late joiner opened. Catch-up is optional, so this says so and
 * gives a one-click way back to where the class is (the server's resume pointer).
 */
export function CatchUpBanner({ token }: { token: string }) {
  const home = useQuery({
    queryKey: ["student", "home", token],
    queryFn: ({ signal }) => getStudentHome(token, signal),
    retry: false,
  });
  const resume = home.data?.resume ?? null;
  const classTitle = resume ? home.data?.modules.find((m) => m.moduleId === resume.moduleId)?.title : undefined;
  const href = resume ? `${moduleHref(resume.moduleId)}&a=${encodeURIComponent(resume.activityId)}` : "/student/";

  return (
    <aside aria-label="Catch-up lesson" className="callout mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
      <p className="max-w-prose">
        <span className="font-bold text-brand">Optional catch-up.</span> This is an earlier lesson. Nothing waits on it
        {classTitle ? (
          <>
            , and your class is on <strong>{classTitle}</strong>.
          </>
        ) : (
          "."
        )}
      </p>
      <Link href={href} className="btn btn-secondary">
        <Icon name="play" />
        {classTitle ? "Jump to where your class is" : "Back to your path"}
      </Link>
    </aside>
  );
}
