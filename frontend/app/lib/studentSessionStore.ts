import type { StudentSession } from "./api/student";

// Where the student session lives: sessionStorage, so closing the tab signs the
// student out. That matters on shared Chromebooks (docs/architecture.md, section 5).
// A small external store lets React components read it safely in a static export.

const KEY = "cic.studentSession";
let cache: StudentSession | null | undefined; // undefined = not read from storage yet
const listeners = new Set<() => void>();

function read(): StudentSession | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StudentSession;
    if (!parsed?.sessionToken || new Date(parsed.expiresAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function getSessionSnapshot(): StudentSession | null {
  if (cache === undefined) cache = read();
  return cache;
}

/** On the server (the static build) there is never a session. */
export function getServerSnapshot(): StudentSession | null {
  return null;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function saveSession(session: StudentSession): void {
  cache = session;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage can be blocked (private mode). The session still works until the page closes.
  }
  emit();
}

export function clearSession(): void {
  cache = null;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up if storage is blocked.
  }
  emit();
}
