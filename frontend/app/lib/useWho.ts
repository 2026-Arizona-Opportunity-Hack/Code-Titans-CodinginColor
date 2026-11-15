"use client";

import { useStaffSession } from "../context/StaffSessionContext";
import { useStudentSession } from "../context/StudentSessionContext";
import type { StaffRole } from "./api/staff";
import { roleFromToken } from "./cognito";
import { ROLE_HOME } from "./staffNav";

export type Who =
  | { kind: "staff"; role: StaffRole | null; home: string }
  | { kind: "student"; home: string }
  | { kind: "none"; home: string };

/** Demo tokens look like "staff_mock_<role>"; real ones are Cognito ID tokens. */
function roleOf(token: string): StaffRole | null {
  return token.startsWith("staff_mock_") ? (token.slice("staff_mock_".length) as StaffRole) : roleFromToken(token);
}

/**
 * Who is signed in on this browser, and where their home page is. The logo and the landing page use this so a
 * signed-in person is never offered "Teacher sign in" and never sent back to the public home page.
 * Until the browser has taken over from the static HTML this reports "none", the same as the server rendered.
 */
export function useWho(): Who {
  const { token } = useStaffSession();
  const { session } = useStudentSession();
  if (token) {
    const role = roleOf(token);
    return { kind: "staff", role, home: role ? ROLE_HOME[role] : "/instructor/" };
  }
  if (session) return { kind: "student", home: "/student/" };
  return { kind: "none", home: "/" };
}
