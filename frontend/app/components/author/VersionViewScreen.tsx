"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "../../lib/api/client";
import { getVersionDoc } from "../../lib/api/curriculum";
import { StaffPage } from "../common/StaffPage";
import { ModuleView } from "../curriculum/ModuleView";

function Body({ token, moduleId, version }: { token: string; moduleId: string; version: number }) {
  const doc = useQuery({ queryKey: ["version-doc", token, moduleId, version], queryFn: ({ signal }) => getVersionDoc(token, moduleId, version, signal), retry: false });
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm"><Link href={`/author/versions/?id=${encodeURIComponent(moduleId)}`}>← Back to versions</Link></nav>
      {doc.isPending ? <div role="status" aria-label="Loading version" className="skeleton h-40" /> : null}
      {doc.isError ? <p role="alert" className="callout callout-danger font-bold text-danger">{doc.error instanceof ApiError ? doc.error.message : "We couldn't load this version."}</p> : null}
      {doc.data ? (
        <>
          <h1>{doc.data.title}</h1>
          <p className="mt-1 text-muted">Version {version}, frozen. This is a read-only preview with the answers shown.</p>
          <ModuleView doc={doc.data} />
        </>
      ) : null}
    </>
  );
}

export function VersionViewScreen() {
  const params = useSearchParams();
  const moduleId = params.get("id") ?? "";
  const version = Number(params.get("v"));
  return (
    <StaffPage roles={["cic_admin", "instructor", "reviewer"]}>
      {({ token }) => moduleId && Number.isInteger(version) && version > 0 ? <Body token={token} moduleId={moduleId} version={version} /> : <p role="alert" className="callout callout-danger">No version was chosen.</p>}
    </StaffPage>
  );
}
