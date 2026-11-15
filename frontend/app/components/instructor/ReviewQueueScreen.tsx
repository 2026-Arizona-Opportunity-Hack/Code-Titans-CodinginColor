"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError } from "../../lib/api/client";
import { getReviewQueue, reviewSubmission, type ReviewItem } from "../../lib/api/reports";
import { StaffPage } from "../common/StaffPage";

function ReviewCard({ token, classId, item }: { token: string; classId: string; item: ReviewItem }) {
  const qc = useQueryClient();
  const [score, setScore] = useState("");
  const [comment, setComment] = useState("");
  const id = `review-${item.submissionId}`;
  const n = score.trim() === "" ? NaN : Number(score);
  const valid = Number.isFinite(n) && n >= 0 && n <= 100;

  const save = useMutation({
    mutationFn: () => reviewSubmission(token, classId, item.submissionId, { score: n, comment: comment.trim() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["review-queue", token, classId] }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) save.mutate();
  }

  const answers = Object.entries(item.answers);
  return (
    <li className="card">
      <h2 className="text-lg">{item.student?.displayName ?? "Unknown student"}</h2>
      <p className="text-sm text-muted">
        {item.moduleId} · worksheet · submitted {new Date(item.submittedAt).toLocaleString()}
        {item.autoScorePct !== null ? ` · auto-checked parts: ${item.autoScorePct}%` : ""}
      </p>
      <dl className="mt-3 space-y-2">
        {answers.length === 0 ? <p className="text-muted">No written answers were saved.</p> : null}
        {answers.map(([field, value]) => (
          <div key={field}>
            <dt className="text-sm font-bold">{field}</dt>
            {/* Plain text only: student answers are never rendered as HTML. */}
            <dd className="whitespace-pre-wrap rounded border border-line p-2">{String(value)}</dd>
          </div>
        ))}
      </dl>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:max-w-lg">
        <div>
          <label htmlFor={`${id}-score`} className="block font-bold">Score (0 to 100)</label>
          <input id={`${id}-score`} className="field mt-1 max-w-32" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} aria-invalid={score !== "" && !valid} />
        </div>
        <div>
          <label htmlFor={`${id}-comment`} className="block font-bold">Comment for your records (optional)</label>
          <textarea id={`${id}-comment`} className="field mt-1" rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        {score !== "" && !valid ? <p role="alert" className="font-bold text-danger">Enter a number from 0 to 100.</p> : null}
        {save.isError ? <p role="alert" className="font-bold text-danger">{save.error instanceof ApiError ? save.error.message : "The review could not be saved."}</p> : null}
        <div>
          <button type="submit" className="btn btn-primary" disabled={!valid || save.isPending}>
            {save.isPending ? "Saving…" : "Save review"}<span className="sr-only"> for {item.student?.displayName}</span>
          </button>
        </div>
      </form>
    </li>
  );
}

function Body({ token, classId }: { token: string; classId: string }) {
  const queue = useQuery({
    queryKey: ["review-queue", token, classId],
    queryFn: ({ signal }) => getReviewQueue(token, classId, signal),
    retry: false,
    refetchOnMount: "always",
  });
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href={`/instructor/class/?id=${encodeURIComponent(classId)}`}>← Back to class</Link>
      </nav>
      <h1>Worksheets to review</h1>
      <p className="mt-1 text-muted">Written answers the computer can&apos;t mark. Once you save a score, the worksheet leaves this list.</p>
      {queue.isPending ? <div role="status" aria-label="Loading" className="skeleton mt-6 h-40" /> : null}
      {queue.isError ? <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">{queue.error instanceof ApiError ? queue.error.message : "We couldn't load the list."}</p> : null}
      {queue.data && queue.data.length === 0 ? <p className="card mt-6 max-w-xl">Nothing is waiting for review.</p> : null}
      {queue.data && queue.data.length > 0 ? (
        <>
          <p aria-live="polite" className="mt-4 text-sm text-muted">{queue.data.length} waiting</p>
          <ul className="mt-2 grid gap-4">
            {queue.data.map((i) => <ReviewCard key={i.submissionId} token={token} classId={classId} item={i} />)}
          </ul>
        </>
      ) : null}
    </>
  );
}

export function ReviewQueueScreen() {
  const classId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={["instructor", "cic_admin"]}>
      {({ token }) => classId ? <Body token={token} classId={classId} /> : <p role="alert" className="callout callout-danger">No class was chosen. Open this page from a class.</p>}
    </StaffPage>
  );
}
