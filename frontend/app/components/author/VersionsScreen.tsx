"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "../../lib/api/client";
import { listVersions } from "../../lib/api/curriculum";
import { StaffPage } from "../common/StaffPage";

function Body({ token, moduleId }: { token: string; moduleId: string }) {
  const versions = useQuery({ queryKey: ["versions", token, moduleId], queryFn: ({ signal }) => listVersions(token, moduleId, signal), retry: false, refetchOnMount: "always" });
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm"><Link href={`/author/edit/?id=${encodeURIComponent(moduleId)}`}>← Back to the editor</Link></nav>
      <h1>Published versions</h1>
      <p className="mt-1 text-muted">Each version is frozen. Classes stay on the version they were assigned until a teacher upgrades.</p>
      {versions.isPending ? <div role="status" aria-label="Loading versions" className="skeleton mt-6 h-32" /> : null}
      {versions.isError ? <p role="alert" className="callout callout-danger mt-6 font-bold text-danger">{versions.error instanceof ApiError ? versions.error.message : "We couldn't load the versions."}</p> : null}
      {versions.data?.length === 0 ? <p className="card mt-6 text-muted">Nothing has been published yet.</p> : null}
      {versions.data && versions.data.length > 0 ? (
        <div className="table-wrap mt-6">
          <table className="table-brand">
            <caption className="sr-only">Published versions, newest first</caption>
            <thead><tr><th scope="col">Version</th><th scope="col">Published</th><th scope="col">By</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
            <tbody>{versions.data.map((v) => <tr key={v.version}><th scope="row">{v.version}</th><td>{new Date(v.publishedAt).toLocaleString()}</td><td>{v.publishedBy}</td><td><Link href={`/author/versions/view/?id=${encodeURIComponent(moduleId)}&v=${v.version}`} className="btn btn-secondary">View<span className="sr-only"> version {v.version}</span></Link></td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

export function VersionsScreen() {
  const moduleId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={["cic_admin", "instructor"]}>
      {({ token, me }) => !me.permissions.canAuthor ? <p role="alert" className="callout callout-danger">You don&apos;t have permission to edit curriculum.</p>
        : moduleId ? <Body token={token} moduleId={moduleId} /> : <p role="alert" className="callout callout-danger">No module was chosen.</p>}
    </StaffPage>
  );
}
