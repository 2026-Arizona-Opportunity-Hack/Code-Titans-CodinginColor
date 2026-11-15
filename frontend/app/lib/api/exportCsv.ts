import { env } from "../../config/env";
import { ApiError } from "./client";

/**
 * GET /classes/{classId}/export?type=gain|progress. The reply is CSV, not the JSON envelope, and
 * the request needs the Authorization header, so a plain link cannot be used: fetch it, then
 * save the file. Every export is recorded in the audit log by the server.
 */
export async function downloadExport(token: string, classId: string, type: "gain" | "progress"): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}/classes/${encodeURIComponent(classId)}/export?type=${type}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.code ?? "UNKNOWN", body?.error ?? "The export could not be created.", body?.requestId);
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${type}-${classId}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
