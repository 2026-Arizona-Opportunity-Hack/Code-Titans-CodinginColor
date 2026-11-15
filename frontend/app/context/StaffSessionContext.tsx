"use client";

import { useSyncExternalStore } from "react";
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
  return { token, hydrated, signIn: saveStaffToken, signOut: clearStaffToken };
}
