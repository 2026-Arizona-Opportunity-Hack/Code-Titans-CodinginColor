// Where the staff sign-in token lives while Cognito is not connected yet: sessionStorage,
// so closing the tab signs out. When Cognito Managed Login is wired up, this store is
// the one place that changes: it will hold the Cognito access token instead.

const KEY = "cic.staffToken";
let cache: string | null | undefined; // undefined = not read from storage yet
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getStaffTokenSnapshot(): string | null {
  if (cache === undefined) {
    try {
      cache = window.sessionStorage.getItem(KEY);
    } catch {
      cache = null;
    }
  }
  return cache;
}

export function getServerSnapshot(): string | null {
  return null;
}

export function subscribeStaffToken(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function saveStaffToken(token: string): void {
  cache = token;
  try {
    window.sessionStorage.setItem(KEY, token);
  } catch {
    // Storage can be blocked (private mode). The token still works until the page closes.
  }
  emit();
}

export function clearStaffToken(): void {
  cache = null;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up if storage is blocked.
  }
  emit();
}
