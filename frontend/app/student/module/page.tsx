"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { StudentShell } from "../../components/common/StudentShell";
import { useRequireStudent } from "../../context/StudentSessionContext";

// PLACEHOLDER: the lesson player (video, questions, worksheet, tests) is built in the
// next step. This page only exists so "Start" and module links lead somewhere.
function ModulePlaceholder() {
  const params = useSearchParams();
  const { session } = useRequireStudent();
  if (!session) return null;

  return (
    <StudentShell studentName={session.student.displayName}>
      <h1>Lesson player</h1>
      <p className="mt-3 text-muted">
        The lesson player is coming in the next step. You opened module &quot;{params.get("id") ?? "?"}&quot;.
      </p>
      <Link href="/student/" className="btn btn-secondary mt-6">
        Back to your path
      </Link>
    </StudentShell>
  );
}

export default function StudentModulePage() {
  return (
    <Suspense>
      <ModulePlaceholder />
    </Suspense>
  );
}
