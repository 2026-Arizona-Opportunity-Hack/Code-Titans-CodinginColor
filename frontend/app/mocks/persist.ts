// Keeps the fake server's data across reloads and tabs, so a teacher can create login words in one
// place and a student can use the link in another. Each fake store registers a snapshot/restore
// pair; data is restored before every fake request and saved after it, in localStorage (shared by
// all tabs). Demo mode only: this includes the login words the fake server issues, which the real
// app never stores in the browser.

type Store = { key: string; snapshot: () => unknown; restore: (data: never) => void };

const PREFIX = "cic.fake.";
const stores: Store[] = [];

export function register<T>(store: { key: string; snapshot: () => T; restore: (data: T) => void }) {
  stores.push(store as Store);
}

export function restoreAll() {
  for (const store of stores) {
    try {
      const raw = window.localStorage.getItem(PREFIX + store.key);
      if (raw) (store.restore as (data: unknown) => void)(JSON.parse(raw));
    } catch { /* blocked or bad data: carry on with what is in memory */ }
  }
}

export function saveAll() {
  for (const store of stores) {
    try {
      window.localStorage.setItem(PREFIX + store.key, JSON.stringify(store.snapshot()));
    } catch { /* blocked or full: the fake server still works, it just forgets on reload */ }
  }
}

/** Forgets everything the fake server has stored. */
export function resetAll() {
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => window.localStorage.removeItem(k));
  } catch { /* nothing to clear if storage is blocked */ }
}
