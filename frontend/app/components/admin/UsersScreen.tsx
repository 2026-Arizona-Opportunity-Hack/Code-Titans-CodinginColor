"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { inviteUser, listUsers, updateUser, type StaffUser } from "../../lib/api/admin";
import { ApiError } from "../../lib/api/client";
import { listOrgs, type Org } from "../../lib/api/staff";
import { StaffPage } from "../common/StaffPage";

const ROLES: [NonNullable<StaffUser["role"]>, string][] = [["instructor", "Instructor"], ["reviewer", "Reviewer"], ["cic_admin", "CIC admin"]];
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
        <select id={`${id}-role`} className="field" value={user.role ?? ""} disabled={change.isPending}
          onChange={(e) => change.mutate({ role: e.target.value as StaffUser["role"] })}>
          {user.role === null ? <option value="">No role</option> : null}
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </td>
      <td>
        {user.role === "instructor" ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-5" checked={user.canAuthor} disabled={change.isPending} onChange={(e) => change.mutate({ canAuthor: e.target.checked })} />
            Can edit all curriculum
          </label>
        ) : user.role === "cic_admin" ? "Always" : "No"}
      </td>
      <td>
        {user.role === "instructor" ? (
          <>
            <label htmlFor={`${id}-school`} className="sr-only">School for {user.name || user.email}</label>
            <select id={`${id}-school`} className="field" value={user.orgId ?? ""} disabled={change.isPending}
              onChange={(e) => change.mutate({ orgId: e.target.value || null })}>
              <option value="">No school (can&apos;t create classes)</option>
              {schools.filter((o) => o.status !== "archived" || o.orgId === user.orgId).map((o) => <option key={o.orgId} value={o.orgId}>{o.name}</option>)}
            </select>
          </>
        ) : (schools.find((o) => o.orgId === user.orgId)?.name ?? "—")}
      </td>
      <td>{user.enabled ? <span className="badge">Active</span> : <span className="badge badge-muted">Disabled</span>}</td>
      <td>
        <button type="button" className="btn btn-secondary" disabled={change.isPending}
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
  const [role, setRole] = useState<"instructor" | "reviewer" | "cic_admin">("instructor");
  const [canAuthor, setCanAuthor] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [invited, setInvited] = useState("");
  const orgs = useQuery({ queryKey: ["orgs", token], queryFn: ({ signal }) => listOrgs(token, signal), retry: false });
  const schools = orgs.data ?? [];
  const users = useQuery({ queryKey: ["users", token], queryFn: ({ signal }) => listUsers(token, signal), retry: false, refetchOnMount: "always" });
  const invite = useMutation({
    mutationFn: () => inviteUser(token, { email: email.trim(), name: name.trim(), role, ...(role === "instructor" && canAuthor ? { canAuthor: true } : {}), ...(role === "instructor" && orgId ? { orgId } : {}) }),
    onSuccess: (u) => { setInvited(u.email); setEmail(""); setName(""); setCanAuthor(false); setOrgId(""); qc.invalidateQueries({ queryKey: ["users", token] }); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setInvited(""); if (email.trim() && name.trim()) invite.mutate(); };

  return (
    <>
      <h1>Users</h1>
      <p className="mt-1 text-muted">Staff who can sign in. Role changes take effect the next time they sign in.</p>

      <form onSubmit={submit} className="card mt-6 max-w-xl">
        <h2 className="text-lg">Invite someone</h2>
        <p className="text-sm text-muted">They get an email with a temporary password and set up their own sign-in.</p>
        <label htmlFor="inv-name" className="mt-3 block font-bold">Name</label>
        <input id="inv-name" className="field mt-1" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <label htmlFor="inv-email" className="mt-3 block font-bold">Email</label>
        <input id="inv-email" type="email" className="field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        <label htmlFor="inv-role" className="mt-3 block font-bold">Role</label>
        <select id="inv-role" className="field mt-1 max-w-xs" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {role === "instructor" ? (
          <>
            <label htmlFor="inv-school" className="mt-3 block font-bold">School</label>
            <p id="inv-school-h" className="text-sm text-muted">Instructors create classes in this school. You can change it later.</p>
            <select id="inv-school" className="field mt-1 max-w-sm" value={orgId} onChange={(e) => setOrgId(e.target.value)} aria-describedby="inv-school-h">
              <option value="">No school yet</option>
              {schools.filter((o) => o.status !== "archived").map((o) => <option key={o.orgId} value={o.orgId}>{o.name}</option>)}
            </select>
          </>
        ) : null}
        {role === "instructor" ? (
          <label className="mt-3 flex items-center gap-2"><input type="checkbox" className="size-5" checked={canAuthor} onChange={(e) => setCanAuthor(e.target.checked)} /> Can edit all curriculum, not only their own modules</label>
        ) : null}
        {invite.isError ? <p role="alert" className="mt-2 font-bold text-danger">{msg(invite.error, "The invitation could not be sent.")}</p> : null}
        {invited ? <p role="status" className="callout mt-3 font-bold">Invitation sent to {invited}.</p> : null}
        <button type="submit" className="btn btn-primary mt-4" disabled={invite.isPending || !email.trim() || !name.trim()}>{invite.isPending ? "Sending…" : "Send invitation"}</button>
      </form>

      <h2 className="mt-8">Everyone</h2>
      {users.isPending ? <div role="status" aria-label="Loading users" className="skeleton mt-3 h-32" /> : null}
      {users.isError ? <p role="alert" className="callout callout-danger mt-3 font-bold text-danger">{msg(users.error, "We couldn't load the users.")}</p> : null}
      {users.data ? (
        <div className="table-wrap mt-3">
          <table className="table-brand">
            <caption className="sr-only">Staff users</caption>
            <thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Edit all curriculum</th><th scope="col">School</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
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
