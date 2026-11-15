"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { inviteUser, listUsers, updateUser, type StaffUser } from "../../lib/api/admin";
import { ApiError } from "../../lib/api/client";
import { listOrgs, type Org } from "../../lib/api/staff";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";

const ROLES: [NonNullable<StaffUser["role"]>, string][] = [["instructor", "Instructor"], ["external_teacher", "External teacher"], ["reviewer", "Reviewer"], ["cic_admin", "CIC admin"]];
/** External teachers belong to external schools, and instructors to CIC schools. */
const schoolsFor = (role: StaffUser["role"], schools: Org[]) => schools.filter((o) => (o.kind === "external") === (role === "external_teacher"));
const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function UserRow({ token, user, schools }: { token: string; user: StaffUser; schools: Org[] }) {
  const qc = useQueryClient();
  const change = useMutation({
    mutationFn: (body: Parameters<typeof updateUser>[2]) => updateUser(token, user.userId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users", token] }),
  });
  const id = `user-${user.userId}`;
  return (
    <tr>
      <th scope="row">{user.name || "—"}<br /><span className="text-sm font-normal text-muted">{user.email}</span></th>
      <td>
        <label htmlFor={`${id}-role`} className="sr-only">Role for {user.name || user.email}</label>
        <select id={`${id}-role`} className="field min-w-36" value={user.role ?? ""} disabled={change.isPending}
          onChange={(e) => change.mutate({ role: e.target.value as StaffUser["role"] })}>
          {user.role === null ? <option value="">No role</option> : null}
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </td>
      <td>
        {user.role === "instructor" ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-5" checked={user.canAuthor} disabled={change.isPending} onChange={(e) => change.mutate({ canAuthor: e.target.checked })} />
            Curriculum author
          </label>
        ) : user.role === "cic_admin" ? "Always" : "No"}
      </td>
      <td>
        {user.role === "instructor" || user.role === "external_teacher" ? (
          <>
            <label htmlFor={`${id}-school`} className="sr-only">School for {user.name || user.email}</label>
            <select id={`${id}-school`} className="field min-w-40" value={user.orgId ?? ""} disabled={change.isPending}
              onChange={(e) => change.mutate({ orgId: e.target.value || null })}>
              <option value="">No school (can&apos;t create classes)</option>
              {schoolsFor(user.role, schools).filter((o) => o.status !== "archived" || o.orgId === user.orgId).map((o) => <option key={o.orgId} value={o.orgId}>{o.name}</option>)}
            </select>
          </>
        ) : (schools.find((o) => o.orgId === user.orgId)?.name ?? "—")}
      </td>
      <td>{user.enabled ? <span className="badge">Active</span> : <span className="badge badge-muted">Disabled</span>}</td>
      <td>
        <button type="button" className="btn btn-secondary btn-sm" disabled={change.isPending}
          onClick={() => { if (user.enabled ? window.confirm(`Disable ${user.name || user.email}? They are signed out straight away.`) : true) change.mutate({ enabled: !user.enabled }); }}>
          {user.enabled ? "Disable" : "Enable"}<span className="sr-only"> {user.name || user.email}</span>
        </button>
        {change.isError ? <p role="alert" className="mt-1 text-sm font-bold text-danger">{msg(change.error, "Could not update.")}</p> : null}
      </td>
    </tr>
  );
}

function Body({ token }: { token: string }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<NonNullable<StaffUser["role"]>>("instructor");
  const [canAuthor, setCanAuthor] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [invited, setInvited] = useState("");
  const orgs = useQuery({ queryKey: ["orgs", token], queryFn: ({ signal }) => listOrgs(token, signal), retry: false });
  const schools = orgs.data ?? [];
  const hasSchool = role === "instructor" || role === "external_teacher";
  const users = useQuery({ queryKey: ["users", token], queryFn: ({ signal }) => listUsers(token, signal), retry: false, refetchOnMount: "always" });
  const invite = useMutation({
    mutationFn: () => inviteUser(token, { email: email.trim(), name: name.trim(), role, ...(role === "instructor" && canAuthor ? { canAuthor: true } : {}), ...(hasSchool && orgId ? { orgId } : {}) }),
    onSuccess: (u) => { setInvited(u.email); setEmail(""); setName(""); setCanAuthor(false); setOrgId(""); qc.invalidateQueries({ queryKey: ["users", token] }); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setInvited(""); if (email.trim() && name.trim()) invite.mutate(); };

  return (
    <>
      <PageHeader title="Users" description="Staff who can sign in. Role changes take effect the next time they sign in." />

      <form onSubmit={submit} className="card mt-6 max-w-3xl">
        <h2 className="text-lg">Invite someone</h2>
        <p className="text-sm text-muted">They get an email with a temporary password and set up their own sign-in.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="inv-name" className="label">Name</label>
            <input id="inv-name" className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="inv-email" className="label">Email</label>
            <input id="inv-email" type="email" className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </div>
        </div>
        <label htmlFor="inv-role" className="mt-3 block font-bold">Role</label>
        <select id="inv-role" className="field mt-1 max-w-sm" value={role} onChange={(e) => { setRole(e.target.value as typeof role); setOrgId(""); }}>
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {hasSchool ? (
          <>
            <label htmlFor="inv-school" className="mt-3 block font-bold">School</label>
            <p id="inv-school-h" className="text-sm text-muted">{role === "external_teacher" ? "They create classes in this external school. It is required." : "Instructors create classes in this school. You can change it later."}</p>
            <select id="inv-school" className="field mt-1 max-w-sm" value={orgId} onChange={(e) => setOrgId(e.target.value)} aria-describedby="inv-school-h">
              <option value="">{role === "external_teacher" ? "Choose a school" : "No school yet"}</option>
              {schoolsFor(role, schools).filter((o) => o.status !== "archived").map((o) => <option key={o.orgId} value={o.orgId}>{o.name}</option>)}
            </select>
          </>
        ) : null}
        {role === "instructor" ? (
          <label className="mt-3 flex items-center gap-2"><input type="checkbox" className="size-5" checked={canAuthor} onChange={(e) => setCanAuthor(e.target.checked)} /> Curriculum author: can create and edit every module</label>
        ) : null}
        {invite.isError ? <p role="alert" className="mt-2 font-bold text-danger">{msg(invite.error, "The invitation could not be sent.")}</p> : null}
        {invited ? <p role="status" className="callout mt-3 font-bold">Invitation sent to {invited}.</p> : null}
        <button type="submit" className="btn btn-primary mt-4" disabled={invite.isPending || !email.trim() || !name.trim() || (role === "external_teacher" && !orgId)}>{invite.isPending ? "Sending…" : "Send invitation"}</button>
      </form>

      <h2 className="mt-10">Everyone</h2>
      {users.isPending ? <div role="status" aria-label="Loading users" className="skeleton mt-3 h-32" /> : null}
      {users.isError ? <p role="alert" className="callout callout-danger mt-3 font-bold text-danger">{msg(users.error, "We couldn't load the users.")}</p> : null}
      {users.data ? (
        <div className="table-wrap mt-3">
          <table className="table-brand">
            <caption className="sr-only">Staff users</caption>
            <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Curriculum author</th><th scope="col">School</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{users.data.map((u) => <UserRow key={u.userId} token={token} user={u} schools={schools} />)}</tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

export function UsersScreen() {
  return <StaffPage roles={["cic_admin"]}>{({ token }) => <Body token={token} />}</StaffPage>;
}
