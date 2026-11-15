"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError } from "../../lib/api/client";
import { getReviewQueue, reviewSubmission, type ReviewItem } from "../../lib/api/reports";
import { Icon } from "../common/Icon";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";
import { TEACHER_ROLES } from "../../lib/api/staff";

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
    <li className="card grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0">
        <h2 className="text-lg">{item.student?.displayName ?? "Unknown student"}</h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span>{item.moduleId}</span>
          <span>Submitted {new Date(item.submittedAt).toLocaleString()}</span>
          {item.autoScorePct !== null ? <span className="badge badge-muted">Auto-checked parts: {item.autoScorePct}%</span> : null}
        </p>
        {answers.length === 0 ? <p className="mt-4 text-muted">No written answers were saved.</p> : null}
        <dl className="mt-4 space-y-3">
          {answers.map(([field, value]) => (
            <div key={field}>
              <dt className="text-sm font-bold">{field}</dt>
              {/* Plain text only: student answers are never rendered as HTML. */}
              <dd className="mt-1 whitespace-pre-wrap rounded-lg border border-hairline bg-wash p-3">{String(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl bg-wash p-4 lg:self-start">
        <div>
          <label htmlFor={`${id}-score`} className="label">Score (0 to 100)</label>
          <input id={`${id}-score`} className="field mt-1 max-w-32" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} aria-invalid={score !== "" && !valid} />
        </div>
        <div>
          <label htmlFor={`${id}-comment`} className="label">Comment <span className="font-normal text-muted">(optional, for your records)</span></label>
          <textarea id={`${id}-comment`} className="field mt-1" rows={2} maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
        {score !== "" && !valid ? <p role="alert" className="font-bold text-danger">Enter a number from 0 to 100.</p> : null}
        {save.isError ? <p role="alert" className="font-bold text-danger">{save.error instanceof ApiError ? save.error.message : "The review could not be saved."}</p> : null}
        <button type="submit" className="btn btn-primary" disabled={!valid || save.isPending}>
          {save.isPending ? "Saving…" : "Save review"}<span className="sr-only"> for {item.student?.displayName}</span>
        </button>
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
      <PageHeader
        back={{ href: `/instructor/class/?id=${encodeURIComponent(classId)}`, label: "Back to class" }}
        title="Worksheets to review"
        description="Written answers the computer can't mark. Once you save a score, the worksheet leaves this list."
      />
      {queue.isPending ? <div role="status" aria-label="Loading" className="skeleton h-40" /> : null}
      {queue.isError ? <p role="alert" className="callout callout-danger font-bold text-danger">{queue.error instanceof ApiError ? queue.error.message : "We couldn't load the list."}</p> : null}
      {queue.data && queue.data.length === 0 ? <div className="empty">
          <span className="icon-tile"><Icon name="check" className="size-6" /></span>
          <h2 className="text-lg">All caught up</h2>
          <p className="text-muted">Nothing is waiting for review.</p>
        </div> : null}
      {queue.data && queue.data.length > 0 ? (
        <>
          <p aria-live="polite" className="text-sm font-bold text-muted">{queue.data.length} waiting</p>
          <ul className="mt-3 grid gap-4">
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
    <StaffPage roles={TEACHER_ROLES}>
      {({ token }) => classId ? <Body token={token} classId={classId} /> : <p role="alert" className="callout callout-danger">No class was chosen. Open this page from a class.</p>}
    </StaffPage>
  );
}
