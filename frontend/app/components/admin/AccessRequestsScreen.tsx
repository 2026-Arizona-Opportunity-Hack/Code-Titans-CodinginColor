"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { approveAccessRequest, denyAccessRequest, listAccessRequests, listSchools, type AccessRequest } from "../../lib/api/admin";
import { ApiError } from "../../lib/api/client";
import { Icon } from "../common/Icon";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";
const msg = (e: unknown, f: string) => (e instanceof ApiError ? e.message : f);
const STATUSES: [AccessRequest["status"], string][] = [["pending", "Waiting"], ["approved", "Approved"], ["denied", "Denied"]];
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
function Pending({ token, request }: { token: string; request: AccessRequest }) {
  const qc = useQueryClient();
  const [orgId, setOrgId] = useState("");
  const schools = useQuery({ queryKey: ["schools", token], queryFn: ({ signal }) => listSchools(token, signal), retry: false });
  const external = (schools.data ?? []).filter((s) => s.kind === "external" && s.status === "active");
  const done = () => qc.invalidateQueries({ queryKey: ["access-requests", token] });
  const approve = useMutation({ mutationFn: () => approveAccessRequest(token, request.requestId, orgId || undefined), onSuccess: () => { done(); qc.invalidateQueries({ queryKey: ["schools", token] }); } });
  const deny = useMutation({ mutationFn: () => denyAccessRequest(token, request.requestId), onSuccess: done });
  const busy = approve.isPending || deny.isPending;
  const id = `req-${request.requestId}`;
  const error = approve.error ?? deny.error;
  return (
    <li className="card">
      <h2 className="text-lg">{request.name}</h2>
      <p className="text-muted">{request.email} · {request.organization} · asked {day(request.createdAt)}</p>
      {request.note ? <p className="mt-2">{request.note}</p> : null}
      <label htmlFor={`${id}-school`} className="mt-4 block font-bold">School</label>
      <select id={`${id}-school`} className="field mt-1 max-w-sm" value={orgId} disabled={busy} onChange={(e) => setOrgId(e.target.value)}>
        <option value="">Create a new school: {request.organization}</option>
        {external.map((s) => <option key={s.orgId} value={s.orgId}>{s.name}</option>)}
      </select>
      {error ? <p role="alert" className="mt-2 font-bold text-danger">{msg(error, "That didn't work. Please try again.")}</p> : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => approve.mutate()}>{approve.isPending ? "Approving…" : "Approve and send invite"}<span className="sr-only"> for {request.name}</span></button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { if (window.confirm(`Deny the request from ${request.name}? They cannot ask again with this email.`)) deny.mutate(); }}>Deny<span className="sr-only"> {request.name}</span></button>
      </div>
    </li>
  );
}
function Body({ token }: { token: string }) {
  const [status, setStatus] = useState<AccessRequest["status"]>("pending");
  const list = useQuery({ queryKey: ["access-requests", token, status], queryFn: ({ signal }) => listAccessRequests(token, status, signal), retry: false, refetchOnMount: "always" });
  return (
    <>
      <PageHeader title="Access requests" description="Teachers outside CIC who asked for an account. Approving sends them an invite as an external teacher. They manage their own students, and CIC sees usage only." />
      <div role="group" aria-label="Show requests that are" className="mt-2 flex flex-wrap gap-2">
        {STATUSES.map(([v, l]) => (
          <button key={v} type="button" className="chip" aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
        ))}
      </div>
      {list.isPending ? <div role="status" aria-label="Loading requests" className="skeleton mt-6 h-32" /> : null}
      {list.isError ? <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">{msg(list.error, "We couldn't load the requests.")}</p> : null}
      {list.data && list.data.length === 0 ? <div className="empty mt-6">
          <span className="icon-tile"><Icon name="userPlus" className="size-6" /></span>
          <h2 className="text-lg">No {status === "pending" ? "waiting" : status} requests</h2>
        </div> : null}
      {list.data && list.data.length > 0 && status === "pending" ? <ul className="mt-6 flex flex-col gap-4">{list.data.map((r) => <Pending key={r.requestId} token={token} request={r} />)}</ul> : null}
      {list.data && list.data.length > 0 && status !== "pending" ? (
        <div className="table-wrap mt-6">
          <table className="table-brand">
            <caption className="sr-only">{status} access requests</caption>
            <thead><tr><th scope="col">Person</th><th scope="col">School</th><th scope="col">Decided</th></tr></thead>
            <tbody>{list.data.map((r) => (
              <tr key={r.requestId}>
                <th scope="row">{r.name}<br /><span className="text-sm font-normal text-muted">{r.email}</span></th>
                <td>{r.organization}</td>
                <td>{r.decidedAt ? day(r.decidedAt) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
export function AccessRequestsScreen() {
  return <StaffPage roles={["cic_admin"]}>{({ token }) => <Body token={token} />}</StaffPage>;
}
