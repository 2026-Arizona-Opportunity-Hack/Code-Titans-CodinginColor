"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ApiError } from "../../lib/api/client";
import { createClass, listOrgs, type StaffMe } from "../../lib/api/staff";
import { StaffPage } from "../common/StaffPage";
import { classHref } from "./ClassList";

const inputClass = "mt-1 min-h-11 w-full rounded-lg border-2 border-muted bg-surface px-3 py-2";
const MAX_NAME = 100;

function CreateClassBody({ token, me }: { token: string; me: StaffMe }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isAdmin = me.role === "cic_admin";

  // Only admins can list schools (GET /admin/orgs). Instructors use the school on their account.
  const orgs = useQuery({
    queryKey: ["orgs", token],
    queryFn: ({ signal }) => listOrgs(token, signal),
    enabled: isAdmin,
    retry: false,
  });

  const [name, setName] = useState("");
  const [pickedOrg, setPickedOrg] = useState("");
  const [termStart, setTermStart] = useState("");
  const [termEnd, setTermEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orgId = isAdmin ? pickedOrg : (me.orgId ?? "");
  const noSchool = !isAdmin && !me.orgId;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter a class name.");
    if (trimmed.length > MAX_NAME) return setError(`Keep the class name under ${MAX_NAME} characters.`);
    if (!orgId) return setError("Choose a school.");
    if (termStart && termEnd && termEnd < termStart) return setError("The end date can't be before the start date.");

    setBusy(true);
    setError(null);
    try {
      const created = await createClass(token, {
        name: trimmed,
        orgId,
        ...(termStart ? { termStart } : {}),
        ...(termEnd ? { termEnd } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ["classes"] });
      router.push(classHref(created.classId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href="/instructor/">← Your classes</Link>
      </nav>
      <h1 className="text-3xl">New class</h1>
      <p className="mt-1 text-muted">You&apos;ll add students and choose modules next.</p>

      {noSchool ? (
        <p role="alert" className="mt-6 rounded-lg border-2 border-danger p-4 text-danger">
          <span className="font-bold">Your account isn&apos;t linked to a school yet,</span> so a class can&apos;t be created.
          Ask a CIC admin to link it.
        </p>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="mt-8 flex max-w-xl flex-col gap-6">
        <div>
          <label htmlFor="name" className="block font-bold">
            Class name
          </label>
          <p id="name-hint" className="text-sm text-muted">
            For example, Period 3 or Summer Camp A.
          </p>
          <input
            id="name"
            name="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME}
            autoComplete="off"
            aria-describedby="name-hint"
            className={inputClass}
          />
        </div>

        {isAdmin ? (
          <div>
            <label htmlFor="org" className="block font-bold">
              School
            </label>
            <select
              id="org"
              name="org"
              value={pickedOrg}
              onChange={(e) => setPickedOrg(e.target.value)}
              disabled={orgs.isPending}
              className={inputClass}
            >
              <option value="">{orgs.isPending ? "Loading schools…" : "Choose a school"}</option>
              {orgs.data
                ?.filter((org) => org.status !== "archived")
                .map((org) => (
                  <option key={org.orgId} value={org.orgId}>
                    {org.name}
                  </option>
                ))}
            </select>
            {orgs.isError ? <p className="mt-1 text-sm text-danger">We couldn&apos;t load the schools list.</p> : null}
          </div>
        ) : me.orgId ? (
          <div>
            <p className="font-bold">School</p>
            <p className="mt-1">{me.orgName ?? "Your school"}</p>
            <p className="text-sm text-muted">Classes are created in the school on your account. A CIC admin can change it.</p>
          </div>
        ) : null}

        <fieldset className="grid gap-6 sm:grid-cols-2">
          <legend className="mb-2 font-bold">
            Term <span className="font-normal text-muted">(optional)</span>
          </legend>
          <div>
            <label htmlFor="termStart" className="block">
              Starts
            </label>
            <input
              id="termStart"
              name="termStart"
              type="date"
              value={termStart}
              onChange={(e) => setTermStart(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="termEnd" className="block">
              Ends
            </label>
            <input
              id="termEnd"
              name="termEnd"
              type="date"
              value={termEnd}
              onChange={(e) => setTermEnd(e.target.value)}
              className={inputClass}
            />
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="rounded-lg border-2 border-danger p-3 font-bold text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn btn-primary" disabled={busy || noSchool}>
            {busy ? "Creating…" : "Create class"}
          </button>
          <Link href="/instructor/" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}

export function CreateClassForm() {
  return (
    <StaffPage roles={["instructor", "cic_admin"]}>{({ token, me }) => <CreateClassBody token={token} me={me} />}</StaffPage>
  );
}
