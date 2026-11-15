"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useStudentSession } from "../../context/StudentSessionContext";
import { ApiError } from "../../lib/api/client";
import { loginStudent } from "../../lib/api/student";
import { PublicShell } from "../common/PublicShell";

// Students have no accounts. The normal way in is the personal link their teacher
// gives them: https://<app>/s/#<classCode>.<secret-words>. The secret is in the URL
// fragment, which is never sent to a server, and is removed from the address bar
// as soon as this page reads it. Typing the class code and words is the fallback.

const LINK_FAILED = "This link didn't work. Ask your teacher for a new one, or type your class code and secret words below.";
const FORM_FAILED = "That didn't work. Check your login sheet, or ask your teacher for help.";
const DEFAULT_LOCKOUT_SECONDS = 300; // 5 minutes, per docs/architecture.md section 5

const inputClass = "field mt-1";

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

function normalizeWords(value: string) {
  // "Maple Tiger Blue" and "maple-tiger-blue" are the same secret.
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function readLink(): { classCode: string; words: string } | null {
  if (typeof window === "undefined") return null;
  const match = /^#([^.]+)\.(.+)$/.exec(window.location.hash);
  if (!match) return null;
  try {
    return { classCode: decodeURIComponent(match[1]), words: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

function describeFailure(error: unknown, fromLink: boolean): { message: string | null; lockoutSeconds?: number } {
  if (error instanceof ApiError) {
    if (error.code === "LOGIN_THROTTLED") {
      return { message: null, lockoutSeconds: error.retryAfterSeconds ?? DEFAULT_LOCKOUT_SECONDS };
    }
    if (error.status === 401) return { message: fromLink ? LINK_FAILED : FORM_FAILED };
    return { message: error.message };
  }
  return { message: "Something went wrong. Please try again." };
}

function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function StudentEntry() {
  const router = useRouter();
  const expired = useSearchParams().get("expired") === "1";
  const { session, hydrated, signIn } = useStudentSession();

  const [link] = useState(readLink);
  const [linkFailed, setLinkFailed] = useState(false);
  const startedRef = useRef(false);

  const [classCode, setClassCode] = useState("");
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  function lockOut(seconds: number) {
    const current = Date.now();
    setNow(current);
    setLockedUntil(current + seconds * 1000);
  }

  // Already signed in, or just signed in: go to the student's home.
  useEffect(() => {
    if (hydrated && session) router.replace("/student/");
  }, [hydrated, session, router]);

  // Opened with a personal link: sign in automatically.
  useEffect(() => {
    if (!hydrated || session || !link || startedRef.current) return;
    startedRef.current = true;
    // Take the secret out of the address bar right away.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    loginStudent(normalizeCode(link.classCode), normalizeWords(link.words))
      .then(signIn)
      .catch((error) => {
        const result = describeFailure(error, true);
        setLinkFailed(true);
        setMessage(result.message);
        if (result.lockoutSeconds) lockOut(result.lockoutSeconds);
      });
  }, [hydrated, session, link, signIn]);

  // Tick the lockout countdown once a second.
  useEffect(() => {
    if (lockedUntil === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [lockedUntil]);

  const secondsLeft = lockedUntil === null ? 0 : Math.max(0, Math.ceil((lockedUntil - now) / 1000));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = normalizeCode(classCode);
    const secret = normalizeWords(words);
    if (!code || !secret) {
      setMessage("Enter your class code and your secret words.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      signIn(await loginStudent(code, secret));
    } catch (error) {
      const result = describeFailure(error, false);
      setMessage(result.message);
      if (result.lockoutSeconds) lockOut(result.lockoutSeconds);
    } finally {
      setBusy(false);
    }
  }

  const opening = !hydrated || session !== null || (link !== null && !linkFailed);
  if (opening) {
    return (
      <PublicShell>
        <h1>Opening your lesson…</h1>
        <p role="status" className="mt-4 flex items-center gap-3 text-muted">
          <span aria-hidden="true" className="inline-block size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          One moment while we find your class.
        </p>
      </PublicShell>
    );
  }

  const locked = secondsLeft > 0;

  return (
    <PublicShell>
      <h1>Open your lesson</h1>
      <p className="mt-2 text-muted">
        Use the link your teacher gave you. If you don&apos;t have it, enter the class code and secret words from your
        login sheet.
      </p>

      {expired && !message ? (
        <p role="status" className="callout mt-6">
          Your session ended. Open your link again to continue, or enter your class code and secret words.
        </p>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="mt-8 flex flex-col gap-6">
        <div>
          <label htmlFor="classCode" className="block font-bold">
            Class code
          </label>
          <p id="classCode-hint" className="text-sm text-muted">
            On your login sheet, for example K7M4QX.
          </p>
          <input
            id="classCode"
            name="classCode"
            type="text"
            value={classCode}
            onChange={(e) => setClassCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-describedby="classCode-hint"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="words" className="block font-bold">
            Your secret words
          </label>
          <p id="words-hint" className="text-sm text-muted">
            Three words, for example maple-tiger-blue.
          </p>
          <input
            id="words"
            name="words"
            type="text"
            value={words}
            onChange={(e) => setWords(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby="words-hint"
            className={inputClass}
          />
        </div>

        {message ? (
          <p role="alert" className="callout callout-danger font-bold text-danger">
            {message}
          </p>
        ) : null}

        {locked ? (
          <div>
            <p role="alert" className="callout callout-danger font-bold text-danger">
              Too many tries. Please wait before trying again.
            </p>
            {/* Visual countdown only: announcing every second would flood screen readers. */}
            <p aria-hidden="true" className="mt-2 text-muted">
              You can try again in {formatCountdown(secondsLeft)}
            </p>
          </div>
        ) : null}

        <div>
          <button type="submit" className="btn btn-primary" disabled={busy || locked}>
            {busy ? "Opening…" : "Open my lesson"}
          </button>
        </div>
      </form>
    </PublicShell>
  );
}
