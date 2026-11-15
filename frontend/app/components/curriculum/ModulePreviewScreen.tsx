"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "../../lib/api/client";
import { getModuleDoc } from "../../lib/api/curriculum";
import type { StaffRole } from "../../lib/api/staff";
import { StaffPage } from "../common/StaffPage";
import { ModuleView } from "./ModuleView";

function Body({ token, base, moduleId }: { token: string; base: string; moduleId: string }) {
  const doc = useQuery({ queryKey: ["module-doc", token, moduleId], queryFn: ({ signal }) => getModuleDoc(token, moduleId, false, signal), retry: false });
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm"><Link href={`${base}/`}>← Back to curriculum</Link></nav>
      {doc.isPending ? <div role="status" aria-label="Loading module" className="skeleton h-40" /> : null}
      {doc.isError ? <p role="alert" className="callout callout-danger font-bold text-danger">{doc.error instanceof ApiError ? doc.error.message : "We couldn't load this module."}</p> : null}
      {doc.data ? (
        <>
          <h1>{doc.data.title}</h1>
          <p className="mt-1 text-muted">Version {doc.data.version}. This is a read-only preview with the answers shown. Students never see them.</p>
          <ModuleView doc={doc.data} />
        </>
      ) : null}
    </>
  );
}

export function ModulePreviewScreen({ base, roles }: { base: string; roles: StaffRole[] }) {
  const moduleId = useSearchParams().get("id") ?? "";
  return (
    <StaffPage roles={roles}>
      {({ token }) => moduleId ? <Body token={token} base={base} moduleId={moduleId} /> : <p role="alert" className="callout callout-danger">No module was chosen.</p>}
    </StaffPage>
  );
}
