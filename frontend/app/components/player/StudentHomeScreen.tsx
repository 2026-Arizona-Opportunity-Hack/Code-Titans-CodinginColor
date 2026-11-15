"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useRequireStudent } from "../../context/StudentSessionContext";
import { ApiError } from "../../lib/api/client";
import { getStudentHome, logoutStudent } from "../../lib/api/student";
import { PublicShell } from "../common/PublicShell";
import { StudentShell } from "../common/StudentShell";
import { ModuleTrail, moduleHref } from "./ModuleTrail";
import { StartHereCard } from "./StartHereCard";

function HomeSkeleton() {
  return (
    <div role="status" aria-label="Loading your path" className="space-y-4">
      <div className="skeleton h-44" />
      <div className="skeleton h-20" />
      <div className="skeleton h-20" />
    </div>
  );
}

export function StudentHomeScreen() {
  const router = useRouter();
  const { session, hydrated, signOut } = useRequireStudent();
  const token = session?.sessionToken;

  const home = useQuery({
    queryKey: ["student", "home", token],
    queryFn: ({ signal }) => getStudentHome(token as string, signal),
    enabled: Boolean(token),
    retry: false,
  });

  // An expired or revoked session: clear it and send the student back to the entry page.
  const unauthorized = home.error instanceof ApiError && home.error.status === 401;
  useEffect(() => {
    if (unauthorized) {
      signOut();
      router.replace("/s/?expired=1");
    }
  }, [unauthorized, signOut, router]);

  async function onSignOut() {
    if (token) {
      try {
        await logoutStudent(token);
      } catch {
        // Signing out locally is enough if the server cannot be reached.
      }
    }
    signOut();
    router.replace("/s/");
  }

  if (!hydrated || !session) {
    return (
      <PublicShell>
        <p role="status" className="text-muted">
          Loading…
        </p>
      </PublicShell>
    );
  }

  const data = home.data;
  const resume = data?.resume ?? null;
  const resumeModule = resume ? data?.modules.find((m) => m.moduleId === resume.moduleId) : undefined;
  const catchUpCount = data?.modules.filter((m) => m.state === "catch_up").length ?? 0;
  // Earlier modules exist only for someone who joined after the class started (docs/architecture.md 7.2).
  const startedHere = (resumeModule?.percent ?? 0) > 0;
  const lateJoiner = catchUpCount > 0 && !startedHere;
  const cardLabel = startedHere ? "Pick up where you left off" : lateJoiner ? "Your class is here" : "Start here";
  const detail = resumeModule?.state === "in_progress" ? `${resumeModule.percent}% complete` : undefined;

  return (
    <StudentShell studentName={session.student.displayName} onSignOut={onSignOut}>
      <h1 className="mb-8">Your learning path</h1>

      {home.isPending || unauthorized ? <HomeSkeleton /> : null}

      {home.isError && !unauthorized ? (
        <div role="alert" className="callout callout-danger">
          <p className="font-bold text-danger">We couldn&apos;t load your lessons.</p>
          <p className="mt-1 text-muted">{home.error instanceof ApiError ? home.error.message : "Please try again."}</p>
          <button type="button" className="btn btn-secondary mt-4" onClick={() => home.refetch()}>
            Try again
          </button>
        </div>
      ) : null}

      {data ? (
        <>
          {lateJoiner ? (
            <p role="status" className="callout rise mb-4 p-4 text-lg">
              <span className="font-bold text-brand">Welcome!</span> Your class is already working on{" "}
              <strong>{resumeModule?.title ?? "its current lesson"}</strong>, so that&apos;s where you begin. The earlier lessons are
              optional. Do them whenever you like.
            </p>
          ) : null}
          {resume ? (
            <StartHereCard
              label={cardLabel}
              title={resumeModule?.title ?? "Your next lesson"}
              detail={detail}
              actionLabel={resumeModule?.state === "in_progress" ? "Continue" : "Start"}
              href={`${moduleHref(resume.moduleId)}&a=${encodeURIComponent(resume.activityId)}`}
            />
          ) : data.modules.length > 0 ? (
            <p role="status" className="callout rise p-6 text-lg font-bold text-brand">
              You&apos;ve finished everything assigned so far. Nice work!
            </p>
          ) : (
            <p role="status" className="card rise p-6">
              Your teacher hasn&apos;t assigned any lessons yet. Check back soon.
            </p>
          )}

          <ModuleTrail modules={data.modules} />
        </>
      ) : null}
    </StudentShell>
  );
}
