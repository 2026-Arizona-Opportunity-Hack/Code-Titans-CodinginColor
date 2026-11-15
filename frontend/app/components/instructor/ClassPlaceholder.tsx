"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "../../lib/api/client";
import { getClass } from "../../lib/api/staff";
import { StaffPage } from "../common/StaffPage";

// PLACEHOLDER: the class dashboard (roster, progress, assignments) is built in a later
// step. This page confirms a class opens and shows its class code.
function ClassPlaceholderBody({ token, classId }: { token: string; classId: string }) {
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
          {item.data.joinCode ? (
            <p className="mt-1 text-muted">
              Class code <span className="font-mono font-bold text-ink">{item.data.joinCode}</span>
            </p>
          ) : null}
          <p className="mt-6">
            <Link href={`/instructor/class/import/?id=${encodeURIComponent(classId)}`} className="btn btn-primary">
              Add students from a CSV
            </Link>
          </p>
          <p className="mt-6 rounded-xl border border-line p-5 text-muted">
            The class dashboard (roster, student links and progress) is coming in the next steps.
          </p>
        </>
      ) : null}
    </>
  );
}

export function ClassPlaceholder() {
  const classId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={["instructor", "cic_admin"]}>
      {({ token }) => <ClassPlaceholderBody token={token} classId={classId} />}
    </StaffPage>
  );
}
