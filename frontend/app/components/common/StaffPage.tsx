"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useStaffSession } from "../../context/StaffSessionContext";
import { ApiError } from "../../lib/api/client";
import { getMe, type StaffMe, type StaffRole } from "../../lib/api/staff";
import { navFor, ROLE_HOME, ROLE_LABEL } from "../../lib/staffNav";
import { PublicShell } from "./PublicShell";
import { StaffShell } from "./StaffShell";

/**
 * Wraps every staff screen. It sends anyone not signed in to /login/, loads who they
 * are (GET /me), shows the shell with the right navigation for their role, and blocks
 * roles that are not allowed on the page. The UI hiding things is a convenience only:
 * the API enforces access on every request.
 */
export function StaffPage({
  roles,
  children,
}: {
  roles: StaffRole[];
  children: (context: { token: string; me: StaffMe }) => ReactNode;
}) {
  const router = useRouter();
  const { token, hydrated, signOut } = useStaffSession();

  const meQuery = useQuery({
    queryKey: ["staff", "me", token],
    queryFn: ({ signal }) => getMe(token as string, signal),
    enabled: Boolean(token),
    retry: false,
  });

  const missing = hydrated && !token;
  const unauthorized = meQuery.error instanceof ApiError && meQuery.error.status === 401;

  useEffect(() => {
    if (missing) router.replace("/login/");
  }, [missing, router]);

  useEffect(() => {
    if (unauthorized) {
      signOut();
      router.replace("/login/?expired=1");
    }
  }, [unauthorized, signOut, router]);

  function onSignOut() {
    signOut();
    router.replace("/login/");
  }

  if (!hydrated || missing || unauthorized || meQuery.isPending) {
    return (
      <PublicShell>
        <p role="status" className="text-muted">
          Loading…
        </p>
      </PublicShell>
    );
  }

  if (meQuery.isError || !token) {
    return (
      <PublicShell>
        <div role="alert" className="rounded-xl border-2 border-danger p-5">
          <p className="font-bold text-danger">We couldn&apos;t load your account.</p>
          <p className="mt-1 text-muted">
            {meQuery.error instanceof ApiError ? meQuery.error.message : "Please try again."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="btn btn-secondary" onClick={() => meQuery.refetch()}>
              Try again
            </button>
            <button type="button" className="btn btn-secondary" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </PublicShell>
    );
  }

  const me = meQuery.data;
  return (
    <StaffShell
      items={navFor(me.role)}
      userName={me.displayName || "Staff"}
      roleLabel={ROLE_LABEL[me.role]}
      schoolName={me.role === "instructor" || me.orgId ? (me.orgName ?? null) : undefined}
      onSignOut={onSignOut}
    >
      {roles.includes(me.role) ? (
        children({ token, me })
      ) : (
        <>
          <h1 className="text-3xl">You don&apos;t have access to this page</h1>
          <p className="mt-3 text-muted">Your account is signed in as {ROLE_LABEL[me.role]}.</p>
          <Link href={ROLE_HOME[me.role]} className="btn btn-primary mt-6">
            Go to your home page
          </Link>
        </>
      )}
    </StaffShell>
  );
}
