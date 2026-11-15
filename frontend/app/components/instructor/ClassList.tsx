"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ApiError } from "../../lib/api/client";
import { useState } from "react";
import { listCohorts, listSchools } from "../../lib/api/admin";
import { listClasses, type ClassSummary, TEACHER_ROLES } from "../../lib/api/staff";
import { Icon } from "../common/Icon";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";

export function classHref(classId: string) {
  return `/instructor/class/?id=${encodeURIComponent(classId)}`;
}

function ClassCard({ item }: { item: ClassSummary }) {
  const dates = item.termStart || item.termEnd ? [item.termStart, item.termEnd].filter(Boolean).join(" to ") : null;
  return (
    <li className="card card-interactive group relative flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl">
          {/* The link covers the whole card (after:inset-0) so the tap target is large. */}
          <Link href={classHref(item.classId)} className="no-underline after:absolute after:inset-0">
            {item.name}
          </Link>
        </h2>
        {item.status !== "active" ? <span className="badge badge-muted">{item.status}</span> : null}
      </div>
      <ul className="flex flex-col gap-1.5 text-sm text-muted">
        {item.instructors && item.instructors.length > 0 ? (
          <li className="flex items-center gap-2">
            <Icon name="students" className="size-4" />
            <span className="font-semibold text-ink">
              <span className="sr-only">{item.instructors.length === 1 ? "Instructor: " : "Instructors: "}</span>
              {item.instructors.map((i) => i.name).join(", ")}
            </span>
          </li>
        ) : null}
        {dates ? (
          <li className="flex items-center gap-2">
            <Icon name="calendar" className="size-4" />
            <span className="sr-only">Term: </span>
            {dates}
          </li>
        ) : null}
      </ul>
      <div className="mt-auto flex items-center justify-between border-t border-hairline pt-3">
        {item.joinCode ? (
          <p className="text-sm text-muted">
            Class code <span className="ml-1 rounded-md bg-tint px-2 py-0.5 font-mono font-bold text-brand">{item.joinCode}</span>
          </p>
        ) : (
          <span />
        )}
        <Icon name="arrowRight" className="size-5 text-brand transition-transform group-hover:translate-x-1" />
      </div>
    </li>
  );
}

function ClassListBody({ token, isAdmin }: { token: string; isAdmin: boolean }) {
  const [orgId, setOrgId] = useState("");
  const [cohortId, setCohortId] = useState("");
  const schools = useQuery({ queryKey: ["schools", token], queryFn: ({ signal }) => listSchools(token, signal), enabled: isAdmin, retry: false });
  const cohorts = useQuery({ queryKey: ["cohorts", token], queryFn: ({ signal }) => listCohorts(token, signal), enabled: isAdmin, retry: false });
  const classes = useQuery({
    queryKey: ["classes", token, orgId, cohortId],
    queryFn: ({ signal }) => listClasses(token, signal, { orgId, cohortId }),
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Your classes"
        description="Set up a class, add students, and see how they're doing."
        actions={
          <Link href="/instructor/class/new/" className="btn btn-primary">
            <Icon name="plus" className="size-5" />
            New class
          </Link>
        }
      />
      {isAdmin ? (
        <div className="panel mb-6 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="f-school" className="label">School</label>
            <select id="f-school" className="field mt-1" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              <option value="">All schools</option>
              {schools.data?.map((s) => <option key={s.orgId} value={s.orgId}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-cohort" className="label">Cohort</label>
            <select id="f-cohort" className="field mt-1" value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
              <option value="">All cohorts</option>
              {cohorts.data?.map((c) => <option key={c.cohortId} value={c.cohortId}>{c.name}</option>)}
            </select>
          </div>
        </div>
      ) : null}

      <div>
        {classes.isPending ? (
          <div role="status" aria-label="Loading your classes" className="grid gap-4 sm:grid-cols-2">
            <div className="skeleton h-40" />
            <div className="skeleton h-40" />
          </div>
        ) : null}

        {classes.isError ? (
          <div role="alert" className="callout callout-danger">
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
          <div className="empty">
            <span className="icon-tile">
              <Icon name="classes" className="size-6" />
            </span>
            <p className="text-lg font-bold">You don&apos;t have any classes yet.</p>
            <p className="max-w-md text-muted">Create your first class to add students and hand out their links.</p>
            <Link href="/instructor/class/new/" className="btn btn-primary mt-2">
              <Icon name="plus" className="size-5" />
              Create a class
            </Link>
          </div>
        ) : null}

        {classes.data && classes.data.length > 0 ? (
          <ul className="grid gap-5 sm:grid-cols-2">
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
  return <StaffPage roles={TEACHER_ROLES}>{({ token, me }) => <ClassListBody token={token} isAdmin={me.role === "cic_admin"} />}</StaffPage>;
}
