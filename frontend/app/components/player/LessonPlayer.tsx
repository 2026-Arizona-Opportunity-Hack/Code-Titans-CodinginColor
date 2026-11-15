"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRequireStudent } from "../../context/StudentSessionContext";
import { ApiError } from "../../lib/api/client";
import { getStudentModule, type Activity, type StepResult } from "../../lib/api/studentModule";
import { Icon } from "../common/Icon";
import { PublicShell } from "../common/PublicShell";
import { StudentShell } from "../common/StudentShell";
import { Markdown } from "./Markdown";
import { ModuleComplete } from "./ModuleComplete";
import { QuestionActivity } from "./QuestionActivity";
import { WatchActivity } from "./WatchActivity";
import { WorksheetActivity } from "./WorksheetActivity";

const TYPE_LABEL: Record<Activity["type"], string> = {
  video: "Video",
  slides: "Slides",
  check: "Check",
  exit: "Exit question",
  assessment: "Test",
  worksheet: "Worksheet",
};

function PlayerBody({ token, moduleId, requested }: { token: string; moduleId: string; requested: string | null }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [finished, setFinished] = useState<StepResult | null>(null);

  const lesson = useQuery({
    queryKey: ["student", "module", token, moduleId],
    queryFn: ({ signal }) => getStudentModule(token, moduleId, signal),
    retry: false,
  });

  const activities = lesson.data?.lessons.flatMap((l) => l.activities) ?? [];
  const resumeId = activities.find((a) => a.state === "available" || a.state === "in_progress")?.activityId;
  const current = activities.find((a) => a.activityId === requested) ?? activities.find((a) => a.activityId === resumeId) ?? activities[0];
  const index = current ? activities.indexOf(current) : -1;
  const href = (activityId: string) => `/student/module/?id=${encodeURIComponent(moduleId)}&a=${encodeURIComponent(activityId)}`;

  // Move focus to the step's heading whenever the step changes, for keyboard and screen-reader users.
  useEffect(() => {
    headingRef.current?.focus();
  }, [current?.activityId]);

  async function onDone(result: StepResult) {
    await queryClient.invalidateQueries({ queryKey: ["student"] });
    if (result.next.type === "activity") router.push(href(result.next.activityId));
    else setFinished(result);
  }

  if (lesson.isPending) return <div role="status" aria-label="Loading your lesson" className="skeleton h-72" />;

  if (lesson.isError || !lesson.data || !current) {
    const locked = lesson.error instanceof ApiError && lesson.error.code === "MODULE_LOCKED";
    return (
      <div role="alert" className="callout callout-danger">
        <p className="font-bold text-danger">{locked ? "This module isn't open yet." : "We couldn't load this lesson."}</p>
        <p className="mt-1 text-muted">
          {locked ? "Finish the module before it first." : lesson.error instanceof ApiError ? lesson.error.message : "Please try again."}
        </p>
        <Link href="/student/" className="btn btn-secondary mt-4">
          Back to your path
        </Link>
      </div>
    );
  }

  if (finished) return <ModuleComplete title={lesson.data.title} unlockedId={finished.moduleUnlocked} token={token} />;

  const prev = activities[index - 1];
  const next = activities[index + 1];
  const blocked = current.state === "locked";

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href="/student/" className="inline-flex items-center gap-1">
          <Icon name="arrowLeft" className="size-4" /> Your path
        </Link>
      </nav>
      <h1>{lesson.data.title}</h1>
      <div className="mt-3 flex items-center gap-3">
        <progress className="meter" value={lesson.data.percent} max={100} aria-label={`${lesson.data.title} progress`} />
        <span className="shrink-0 text-sm font-bold text-muted">{lesson.data.percent}%</span>
      </div>

      <ol aria-label="Steps" className="mt-6 flex flex-wrap gap-2">
        {activities.map((a, i) => {
          const label = `Step ${i + 1}: ${a.title}${a.state === "complete" ? ", complete" : a.state === "locked" ? ", locked" : ""}`;
          const isCurrent = a.activityId === current.activityId;
          return (
            <li key={a.activityId}>
              {a.state === "locked" ? (
                <span role="img" aria-label={label} className="grid size-10 place-items-center rounded-full bg-line/30 text-muted">
                  <Icon name="lock" className="size-4" />
                </span>
              ) : (
                <Link
                  href={href(a.activityId)}
                  aria-label={label}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`grid size-10 place-items-center rounded-full font-bold no-underline ${
                    a.state === "complete" ? "bg-brand text-on-brand" : "bg-tint text-brand"
                  } ${isCurrent ? "ring-2 ring-brand ring-offset-2" : ""}`}
                >
                  {a.state === "complete" ? <Icon name="check" className="size-4" /> : i + 1}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      <section aria-labelledby="step-heading" className="card mt-6 sm:p-8">
        <p className="text-sm font-bold text-muted">
          Step {index + 1} of {activities.length} · {TYPE_LABEL[current.type]}
        </p>
        <h2 id="step-heading" ref={headingRef} tabIndex={-1} className="mt-1 mb-5">
          {current.title}
        </h2>

        {current.body ? <Markdown text={current.body} className="mb-5" /> : null}

        {blocked ? (
          <div className="callout">
            <p>Finish the earlier steps first.</p>
            {resumeId ? (
              <Link href={href(resumeId)} className="btn btn-primary mt-3">
                Go to your next step
              </Link>
            ) : null}
          </div>
        ) : current.type === "video" || current.type === "slides" ? (
          <WatchActivity key={current.activityId} activity={current} moduleId={moduleId} token={token} onDone={onDone} />
        ) : current.type === "check" || current.type === "exit" || current.type === "assessment" ? (
          <QuestionActivity key={current.activityId} activity={current} moduleId={moduleId} token={token} onDone={onDone} />
        ) : current.type === "worksheet" ? (
          <WorksheetActivity key={current.activityId} activity={current} moduleId={moduleId} token={token} onDone={onDone} />
        ) : (
          <p className="callout">This kind of step is coming in the next update.</p>
        )}
      </section>

      <nav aria-label="Step navigation" className="mt-6 flex flex-wrap justify-between gap-3">
        {prev ? (
          <Link href={href(prev.activityId)} className="btn btn-secondary">
            <Icon name="arrowLeft" /> Previous
          </Link>
        ) : (
          <span />
        )}
        {next && next.state !== "locked" ? (
          <Link href={href(next.activityId)} className="btn btn-secondary">
            Next
          </Link>
        ) : null}
      </nav>
    </>
  );
}

/** The lesson player: one step at a time, with the whole module's steps always in view. */
export function LessonPlayer() {
  const params = useSearchParams();
  const router = useRouter();
  const { session, hydrated, signOut } = useRequireStudent();
  const moduleId = params.get("id") ?? "";

  if (!hydrated || !session) {
    return (
      <PublicShell>
        <p role="status" className="text-muted">
          Loading…
        </p>
      </PublicShell>
    );
  }

  return (
    <StudentShell
      studentName={session.student.displayName}
      onSignOut={() => {
        signOut();
        router.replace("/s/");
      }}
    >
      {moduleId ? (
        <PlayerBody token={session.sessionToken} moduleId={moduleId} requested={params.get("a")} />
      ) : (
        <p role="alert" className="callout callout-danger">
          No lesson was chosen. Open one from your path.
        </p>
      )}
    </StudentShell>
  );
}
