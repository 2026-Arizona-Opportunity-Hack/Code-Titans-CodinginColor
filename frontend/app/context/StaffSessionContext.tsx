"use client";

import { useEffect, useSyncExternalStore } from "react";
import { env } from "../config/env";
import { refreshIdToken, signOutCognito, tokenExpiry } from "../lib/cognito";
import {
  clearStaffToken,
  getServerSnapshot,
  getStaffTokenSnapshot,
  saveStaffToken,
  subscribeStaffToken,
} from "../lib/staffSessionStore";

const subscribeNever = () => () => {};

/**
 * The signed-in staff member's token, if any. `hydrated` is false until the browser
 * has taken over from the static HTML, so screens avoid flashing "signed out".
 */
export function useStaffSession() {
  const token = useSyncExternalStore(subscribeStaffToken, getStaffTokenSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);

  // ID tokens last an hour. Swap in a fresh one 5 minutes before it expires, so a long
  // class session does not end mid-task. If the refresh fails, the next API call gets a
  // 401 and the page sends the user back to sign in.
  useEffect(() => {
    if (env.useMocks || !token) return;
    const wait = Math.max(0, (tokenExpiry(token) - 300) * 1000 - Date.now());
    const timer = window.setTimeout(async () => {
      const fresh = await refreshIdToken();
      if (fresh && fresh !== token) saveStaffToken(fresh);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [token]);

  return { token, hydrated, signIn: saveStaffToken, signOut };
}

function signOut() {
  if (!env.useMocks) signOutCognito();
  clearStaffToken();
}
