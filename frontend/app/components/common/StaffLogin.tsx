"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useStaffSession } from "../../context/StaffSessionContext";
import { env } from "../../config/env";
import type { StaffRole } from "../../lib/api/staff";
import { ROLE_HOME, ROLE_LABEL } from "../../lib/staffNav";
import { isCognitoConfigured } from "../../lib/cognito";
import { PublicShell } from "./PublicShell";
import { StaffSignInForm } from "./StaffSignInForm";

const DEMO_ROLES: StaffRole[] = ["instructor", "cic_admin", "reviewer"];

/**
 * Staff sign-in. With the real backend this is a Cognito sign-in (email, password, then a
 * new password or authenticator code when Cognito asks). While fake data is on, it offers
 * demo accounts instead so every staff screen can be tried without an account.
 */
export function StaffLogin() {
  const router = useRouter();
  const expired = useSearchParams().get("expired") === "1";
  const { token, hydrated, signIn } = useStaffSession();

  // Set when this page signs the user in, so the redirect below does not also fire
  // and send a reviewer to the instructor pages.
  const signedInHere = useRef(false);

  // Already signed in when the page opened: go to the app. Each page checks the role itself.
  useEffect(() => {
    if (hydrated && token && !signedInHere.current) router.replace("/instructor/");
  }, [hydrated, token, router]);

  function onSignedIn(idToken: string, role: StaffRole | null) {
    signedInHere.current = true;
    signIn(idToken);
    router.push(role ? ROLE_HOME[role] : "/instructor/");
  }

  function continueAs(role: StaffRole) {
    signedInHere.current = true;
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
      ) : isCognitoConfigured() ? (
        <StaffSignInForm onSignedIn={onSignedIn} />
      ) : (
        <p className="mt-3 text-muted">
          Staff sign-in is not set up in this build. Set the Cognito values in{" "}
          <code className="font-mono">frontend/.env.local</code> (see <code className="font-mono">.env.example</code>).
        </p>
      )}
      <p className="mt-8 border-t pt-5 text-sm text-muted">
        Teach outside CIC?{" "}
        <Link href="/request-access/" className="font-bold underline">
          Request a teacher account
        </Link>
      </p>
    </PublicShell>
  );
}
