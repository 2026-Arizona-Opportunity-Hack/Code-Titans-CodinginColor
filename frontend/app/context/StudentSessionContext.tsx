"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import {
  clearSession,
  getServerSnapshot,
  getSessionSnapshot,
  saveSession,
  subscribeSession,
} from "../lib/studentSessionStore";

const subscribeNever = () => () => {};

/**
 * The signed-in student, if any.
 * `hydrated` is false until the browser has taken over from the static HTML, so
 * screens can show a neutral state instead of flashing "signed out".
 */
export function useStudentSession() {
  const session = useSyncExternalStore(subscribeSession, getSessionSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  return { session, hydrated, signIn: saveSession, signOut: clearSession };
}

/** For pages that need a student: sends anyone without a session to the entry page. */
export function useRequireStudent() {
  const router = useRouter();
  const state = useStudentSession();
  const missing = state.hydrated && !state.session;
  useEffect(() => {
    if (missing) router.replace("/s/");
  }, [missing, router]);
  return state;
}
