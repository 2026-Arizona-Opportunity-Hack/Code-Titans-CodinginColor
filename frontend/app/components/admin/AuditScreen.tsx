"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listAudit } from "../../lib/api/admin";
import { ApiError } from "../../lib/api/client";
import { StaffPage } from "../common/StaffPage";

const ACTIONS: Record<string, string> = {
  api_key_created: "Created an API key",
  api_key_revoked: "Revoked an API key",
  export: "Exported class data",
};

function Body({ token }: { token: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const audit = useQuery({
    queryKey: ["audit", token, from, to],
    queryFn: ({ signal }) => listAudit(token, { from, to }, signal),
    retry: false,
    refetchOnMount: "always",
  });

  return (
    <>
      <h1>Audit log</h1>
      <p className="mt-1 text-muted">Who created or revoked API keys and who exported class data, newest first. Shows the last 30 days unless you pick dates.</p>

      <div className="mt-6 flex flex-wrap gap-4">
        <div>
          <label htmlFor="audit-from" className="block font-bold">From</label>
          <input id="audit-from" type="date" className="field mt-1" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label htmlFor="audit-to" className="block font-bold">To</label>
          <input id="audit-to" type="date" className="field mt-1" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {audit.isPending ? <div role="status" aria-label="Loading audit log" className="skeleton mt-6 h-40" /> : null}
      {audit.isError ? (
        <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">
          {audit.error instanceof ApiError ? audit.error.message : "We couldn't load the audit log."}
        </p>
      ) : null}
      {audit.data && audit.data.length === 0 ? <p className="card mt-6 text-muted">Nothing was recorded in this period.</p> : null}
      {audit.data && audit.data.length > 0 ? (
        <>
          <p aria-live="polite" className="mt-6 text-sm text-muted">Showing {audit.data.length} entries</p>
          <div className="table-wrap mt-2">
            <table className="table-brand">
              <caption className="sr-only">Audit log entries, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {audit.data.map((e, i) => (
                  <tr key={`${e.at}-${i}`}>
                    <th scope="row">{new Date(e.at).toLocaleString()}</th>
                    <td>{e.actor}</td>
                    <td>{ACTIONS[e.action] ?? e.action}</td>
                    <td className="text-sm">{Object.entries(e.details).map(([k, v]) => `${k}: ${v}`).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}

export function AuditScreen() {
  return <StaffPage roles={["cic_admin"]}>{({ token }) => <Body token={token} />}</StaffPage>;
}
