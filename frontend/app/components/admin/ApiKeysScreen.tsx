"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { createApiKey, listApiKeys, revokeApiKey } from "../../lib/api/admin";
import { ApiError } from "../../lib/api/client";
import { PageHeader } from "../common/PageHeader";
import { StaffPage } from "../common/StaffPage";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");
const message = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

function Body({ token }: { token: string }) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  // The full key is shown once and kept only in memory.
  const [reveal, setReveal] = useState<{ label: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const keys = useQuery({ queryKey: ["api-keys", token], queryFn: ({ signal }) => listApiKeys(token, signal), retry: false, refetchOnMount: "always" });
  const create = useMutation({
    mutationFn: () => createApiKey(token, { label: label.trim(), scopes: ["read:cohorts"] }),
    onSuccess: (k) => {
      setReveal({ label: k.label, key: k.key });
      setCopied(false);
      setLabel("");
      qc.invalidateQueries({ queryKey: ["api-keys", token] });
    },
  });
  const revoke = useMutation({
    mutationFn: (keyId: string) => revokeApiKey(token, keyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys", token] }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (label.trim()) create.mutate();
  }

  async function copy() {
    if (!reveal) return;
    try {
      await navigator.clipboard.writeText(reveal.key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <PageHeader title="API keys" description="Keys let the CIC dashboard read cohort results. Treat a key like a password." />

      {reveal ? (
        <section role="status" className="callout mt-6">
          <h2 className="text-lg">Copy your new key for &ldquo;{reveal.label}&rdquo; now</h2>
          <p className="mt-1 text-sm text-muted">This is the only time it is shown. If you lose it, revoke it and make another.</p>
          <p className="mt-3 break-all rounded border-2 border-ink-muted p-3 font-mono text-sm">{reveal.key}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={copy}>
              {copied ? "Copied" : "Copy key"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setReveal(null)}>
              I&apos;ve saved it
            </button>
          </div>
        </section>
      ) : null}

      <form onSubmit={submit} className="card mt-6 max-w-xl">
        <h2 className="text-lg">Create a key</h2>
        <label htmlFor="key-label" className="mt-3 block font-bold">
          Label
        </label>
        <p id="key-label-hint" className="text-sm text-muted">What this key is for, for example &ldquo;CIC dashboard&rdquo;. Access is read-only for cohorts.</p>
        <input id="key-label" className="field mt-1" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} aria-describedby="key-label-hint" autoComplete="off" />
        {create.isError ? (
          <p role="alert" className="mt-2 font-bold text-danger">
            {message(create.error, "The key could not be created.")}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary mt-4" disabled={create.isPending || !label.trim()}>
          {create.isPending ? "Creating…" : "Create key"}
        </button>
      </form>

      <h2 className="mt-8">Your keys</h2>
      {keys.isPending ? <div role="status" aria-label="Loading keys" className="skeleton mt-3 h-32" /> : null}
      {keys.isError ? (
        <p role="alert" className="callout callout-danger mt-3 font-bold text-danger">
          {message(keys.error, "We couldn't load the keys.")}
        </p>
      ) : null}
      {revoke.isError ? (
        <p role="alert" className="callout callout-danger mt-3 font-bold text-danger">
          {message(revoke.error, "The key could not be revoked.")}
        </p>
      ) : null}
      {keys.data && keys.data.length === 0 ? <p className="card mt-3 text-muted">No keys yet.</p> : null}
      {keys.data && keys.data.length > 0 ? (
        <div className="table-wrap mt-3">
          <table className="table-brand">
            <caption className="sr-only">API keys</caption>
            <thead>
              <tr>
                <th scope="col">Label</th>
                <th scope="col">Access</th>
                <th scope="col">Created</th>
                <th scope="col">Last used</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.data.map((k) => (
                <tr key={k.keyId}>
                  <th scope="row">{k.label}</th>
                  <td>{k.scopes.join(", ")}</td>
                  <td>{when(k.createdAt)}</td>
                  <td>{when(k.lastUsedAt)}</td>
                  <td>{k.revoked ? <span className="badge badge-muted">Revoked</span> : <span className="badge">Active</span>}</td>
                  <td>
                    {k.revoked ? null : (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={revoke.isPending}
                        onClick={() => {
                          if (window.confirm(`Revoke "${k.label}"? Anything using it stops working straight away.`)) revoke.mutate(k.keyId);
                        }}
                      >
                        Revoke<span className="sr-only"> {k.label}</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

export function ApiKeysScreen() {
  return <StaffPage roles={["cic_admin"]}>{({ token }) => <Body token={token} />}</StaffPage>;
}
