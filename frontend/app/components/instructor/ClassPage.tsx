"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "../../lib/api/client";
import { getClass } from "../../lib/api/staff";
import { StaffPage } from "../common/StaffPage";
import { RosterSection } from "./RosterSection";

// The class page: name, class code, student count and the roster. Progress and
// assignments are added in later steps.
function ClassPageBody({ token, classId }: { token: string; classId: string }) {
  const item = useQuery({
    queryKey: ["class", token, classId],
    queryFn: ({ signal }) => getClass(token, classId, signal),
    enabled: Boolean(classId),
    retry: false,
  });

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href="/instructor/">← Your classes</Link>
      </nav>

      {item.isPending ? (
        <p role="status" className="text-muted">
          Loading…
        </p>
      ) : null}

      {item.isError ? (
        <p role="alert" className="rounded-lg border-2 border-danger p-4 text-danger">
          {item.error instanceof ApiError ? item.error.message : "We couldn't load this class."}
        </p>
      ) : null}

      {item.data ? (
        <>
          <h1 className="text-3xl">{item.data.name}</h1>
          <p className="mt-1 text-muted">
            Class code <span className="font-mono font-bold text-ink">{item.data.joinCode}</span>
            {" · "}
            <span>
              {item.data.counts.students} {item.data.counts.students === 1 ? "student" : "students"}
            </span>
          </p>
          <p className="mt-6 flex flex-wrap gap-3">
            <Link href={`/instructor/class/import/?id=${encodeURIComponent(classId)}`} className="btn btn-primary">
              Add students from a CSV
            </Link>
            <Link href={`/instructor/class/add-student/?id=${encodeURIComponent(classId)}`} className="btn btn-secondary">
              Add a student
            </Link>
            <Link href={`/instructor/class/login-sheet/?id=${encodeURIComponent(classId)}`} className="btn btn-secondary">
              Login sheet
            </Link>
            <Link href={`/instructor/class/assignments/?id=${encodeURIComponent(classId)}`} className="btn btn-secondary">
              Assigned modules
            </Link>
            <Link href={`/instructor/class/progress/?id=${encodeURIComponent(classId)}`} className="btn btn-secondary">
              Progress
            </Link>
            <Link href={`/instructor/class/gain/?id=${encodeURIComponent(classId)}`} className="btn btn-secondary">
              Learning gain
            </Link>
          </p>
          <RosterSection token={token} classId={classId} />
        </>
      ) : null}
    </>
  );
}

export function ClassPage() {
  const classId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={["instructor", "cic_admin"]}>
      {({ token }) => <ClassPageBody token={token} classId={classId} />}
    </StaffPage>
  );
}
