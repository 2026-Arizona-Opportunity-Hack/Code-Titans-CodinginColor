"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useStaffSession } from "../../context/StaffSessionContext";
import { env } from "../../config/env";
import type { StaffRole } from "../../lib/api/staff";
import { ROLE_HOME, ROLE_LABEL } from "../../lib/staffNav";
import { PublicShell } from "./PublicShell";

const DEMO_ROLES: StaffRole[] = ["instructor", "cic_admin", "reviewer"];

/**
 * Staff sign-in. The real sign-in is CIC's Cognito login (Managed Login), which is not
 * connected yet. While fake data is on, this page offers demo accounts so every staff
 * screen can be built and tried. Only the token in staffSessionStore changes later.
 */
export function StaffLogin() {
  const router = useRouter();
  const expired = useSearchParams().get("expired") === "1";
  const { token, hydrated, signIn } = useStaffSession();

  // Already signed in: go to the app. Each page checks the role itself.
  useEffect(() => {
    if (hydrated && token) router.replace("/instructor/");
  }, [hydrated, token, router]);

  function continueAs(role: StaffRole) {
    signIn(`staff_mock_${role}`);
    router.push(ROLE_HOME[role]);
  }

  return (
    <PublicShell>
      <h1 className="text-3xl">Staff sign in</h1>

      {expired ? (
        <p role="status" className="mt-6 rounded-lg border-l-8 border-accent bg-tint p-4">
          Your session ended. Please sign in again.
        </p>
      ) : null}

      {env.useMocks ? (
        <section aria-labelledby="demo-heading" className="mt-6">
          <h2 id="demo-heading" className="text-xl">
            Demo accounts (fake data)
          </h2>
          <p className="mt-1 text-muted">Pick a role to try the screens. No password is needed in demo mode.</p>
          <ul className="mt-4 flex flex-col gap-3">
            {DEMO_ROLES.map((role) => (
              <li key={role}>
                <button type="button" className="btn btn-primary w-full sm:w-auto" onClick={() => continueAs(role)}>
                  Continue as {ROLE_LABEL[role]}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="mt-3 text-muted">
          Staff sign-in uses the Coding in Color account login, which is not connected to this build yet. Set the
          Cognito values in <code className="font-mono">frontend/.env.local</code> once the backend is deployed.
        </p>
      )}
    </PublicShell>
  );
}
