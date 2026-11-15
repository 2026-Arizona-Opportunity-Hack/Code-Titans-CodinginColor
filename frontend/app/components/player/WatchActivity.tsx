"use client";

import { useState } from "react";
import { ApiError } from "../../lib/api/client";
import { completeActivity, sendHeartbeat, type Activity, type StepResult } from "../../lib/api/studentModule";
import { useActiveTime } from "../../lib/useActiveTime";
import { playerMessage } from "../../lib/studentErrors";
import { DocumentViewer } from "../common/DocumentViewer";
import { Icon } from "../common/Icon";
import { Markdown } from "./Markdown";

type Watchable = Extract<Activity, { type: "video" | "slides" }>;

// Only well-formed YouTube ids are embedded, through the no-cookie domain (docs/architecture.md section 8).
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** A video or slides step: watch, then mark it done. Active time is reported while the student is here. */
export function WatchActivity({
  activity,
  moduleId,
  token,
  onDone,
}: {
  activity: Watchable;
  moduleId: string;
  token: string;
  onDone: (result: StepResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = activity.state === "complete";
  const [slide, setSlide] = useState(0);
  const slides = activity.type === "slides" ? (activity.slides ?? []) : [];

  const needed = activity.minSeconds ?? 0;
  // Seconds counted so far: what the server already has, plus what this page has counted since.
  const [counted, setCounted] = useState(activity.activeSeconds ?? 0);
  const left = Math.max(0, needed - counted);
  const flush = useActiveTime(
    (seconds) => sendHeartbeat(token, moduleId, activity.activityId, seconds),
    !done,
    true, // watching a video or reading slides needs no clicks; time still only counts while the tab is visible
    () => setCounted((c) => c + 1),
  );
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  async function markDone() {
    setBusy(true);
    setError(null);
    try {
      await flush(); // make sure the server has the time spent before it checks the minimum
      onDone(await completeActivity(token, moduleId, activity.activityId));
    } catch (err) {
      if (err instanceof ApiError && err.code === "TOO_EARLY") {
        // The server's count is the truth; line the countdown up with it.
        const details = err.details as { secondsCounted?: number } | undefined;
        if (typeof details?.secondsCounted === "number") setCounted(details.secondsCounted);
      }
      setError(playerMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {activity.type === "video" ? (
        YOUTUBE_ID.test(activity.videoId) ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${activity.videoId}?rel=0&cc_load_policy=1&hl=en`}
            title={activity.title}
            allow="accelerometer; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="aspect-video w-full rounded-xl border border-line bg-tint"
          />
        ) : (
          <p role="alert" className="callout callout-danger">
            This video can&apos;t be shown. Ask your teacher.
          </p>
        )
      ) : activity.type === "slides" && activity.document ? (
        <DocumentViewer doc={activity.document} title={activity.title} />
      ) : (
        slides.length > 0 ? (
          <div className="card" aria-roledescription="carousel" aria-label={activity.title}>
            <p className="text-sm font-bold text-muted" aria-live="polite">Slide {slide + 1} of {slides.length}</p>
            {slides[slide].title ? <h3 className="mt-1 text-lg font-bold">{slides[slide].title}</h3> : null}
            <Markdown text={slides[slide].body ?? ""} />
            <div className="mt-3 flex gap-3">
              <button type="button" className="btn btn-secondary" disabled={slide === 0} onClick={() => setSlide(slide - 1)}>Previous slide</button>
              <button type="button" className="btn btn-secondary" disabled={slide === slides.length - 1} onClick={() => setSlide(slide + 1)}>Next slide</button>
            </div>
          </div>
        ) : (
          <p className="callout">The slides for this step are not available yet.</p>
        )
      )}

      {error ? (
        <p role="alert" className="callout callout-danger mt-4 font-bold text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-5">
        {done ? (
          <p role="status" className="badge">
            <Icon name="check" className="size-4" /> You finished this step
          </p>
        ) : (
          <div>
            {left > 0 ? (
              <div className="mb-3 max-w-md">
                <p className="text-sm font-bold">
                  {activity.type === "video" ? "Watch" : "Read"} for {clock(left)} more to finish this step
                </p>
                {/* Visual only: announcing every second would flood screen readers. */}
                <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-tint">
                  <div className="h-full bg-brand transition-[width]" style={{ width: `${Math.min(100, (counted / needed) * 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted">Time counts while this page is open on screen.</p>
              </div>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={markDone} disabled={busy || left > 0}>
              {busy ? "Saving…" : left > 0 ? `Available in ${clock(left)}` : "I've finished this step"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
