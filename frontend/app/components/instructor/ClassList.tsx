"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ApiError } from "../../lib/api/client";
import { listClasses, type ClassSummary } from "../../lib/api/staff";
import { StaffPage } from "../common/StaffPage";

export function classHref(classId: string) {
  return `/instructor/class/?id=${encodeURIComponent(classId)}`;
}

function ClassCard({ item }: { item: ClassSummary }) {
  const facts: string[] = [];
  if (item.termStart || item.termEnd) facts.push([item.termStart, item.termEnd].filter(Boolean).join(" to "));
  if (item.status !== "active") facts.push(item.status);

  return (
    <li className="relative rounded-xl border border-line bg-surface p-5 hover:bg-tint">
      <h2 className="text-xl">
        {/* The link covers the whole card (after:inset-0) so the tap target is large. */}
        <Link href={classHref(item.classId)} className="no-underline after:absolute after:inset-0">
          {item.name}
        </Link>
      </h2>
      {facts.length > 0 ? <p className="mt-1 text-muted">{facts.join(" · ")}</p> : null}
      {item.joinCode ? (
        <p className="mt-2 text-sm text-muted">
          Class code <span className="font-mono font-bold text-ink">{item.joinCode}</span>
        </p>
      ) : null}
    </li>
  );
}

function ClassListBody({ token }: { token: string }) {
  const classes = useQuery({
    queryKey: ["classes", token],
    queryFn: ({ signal }) => listClasses(token, signal),
    retry: false,
  });

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl">Your classes</h1>
          <p className="mt-1 text-muted">Set up a class, add students, and see how they&apos;re doing.</p>
        </div>
        <Link href="/instructor/class/new/" className="btn btn-primary">
          New class
        </Link>
      </div>

      <div className="mt-8">
        {classes.isPending ? (
          <div role="status" aria-label="Loading your classes" className="animate-pulse space-y-4">
            <div className="h-24 rounded-xl bg-tint" />
            <div className="h-24 rounded-xl bg-tint" />
          </div>
        ) : null}

        {classes.isError ? (
          <div role="alert" className="rounded-xl border-2 border-danger p-5">
            <p className="font-bold text-danger">We couldn&apos;t load your classes.</p>
            <p className="mt-1 text-muted">
              {classes.error instanceof ApiError ? classes.error.message : "Please try again."}
            </p>
            <button type="button" className="btn btn-secondary mt-4" onClick={() => classes.refetch()}>
              Try again
            </button>
          </div>
        ) : null}

        {classes.data && classes.data.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-8 text-center">
            <p className="text-lg font-bold">You don&apos;t have any classes yet.</p>
            <p className="mt-1 text-muted">Create your first class to add students and hand out their links.</p>
            <Link href="/instructor/class/new/" className="btn btn-primary mt-4">
              Create a class
            </Link>
          </div>
        ) : null}

        {classes.data && classes.data.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {classes.data.map((item) => (
              <ClassCard key={item.classId} item={item} />
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}

export function ClassList() {
  return <StaffPage roles={["instructor", "cic_admin"]}>{({ token }) => <ClassListBody token={token} />}</StaffPage>;
}
