"use client";

import { useState } from "react";
import { ApiError } from "../../lib/api/client";
import { completeActivity, sendHeartbeat, type Activity, type StepResult } from "../../lib/api/studentModule";
import { useActiveTime } from "../../lib/useActiveTime";
import { Icon } from "../common/Icon";

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

  const flush = useActiveTime((seconds) => sendHeartbeat(token, moduleId, activity.activityId, seconds), !done);

  async function markDone() {
    setBusy(true);
    setError(null);
    try {
      await flush(); // make sure the server has the time spent before it checks the minimum
      onDone(await completeActivity(token, moduleId, activity.activityId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {activity.type === "video" ? (
        YOUTUBE_ID.test(activity.videoId) ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${activity.videoId}?rel=0`}
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
      ) : (
        <p className="callout">The slides for this step are not available yet.</p>
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
          <button type="button" className="btn btn-primary" onClick={markDone} disabled={busy}>
            {busy ? "Saving…" : "I've finished this step"}
          </button>
        )}
      </div>
    </div>
  );
}
