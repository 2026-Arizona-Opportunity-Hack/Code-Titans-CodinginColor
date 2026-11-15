import { env } from "../../config/env";

/** Error shape from docs/api.md: { error, code, requestId }, plus the HTTP status. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    /** Seconds from the Retry-After header on a 429, when the browser can read it. */
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Options = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Bearer token: a student session token or a staff Cognito token. */
  token?: string | null;
  signal?: AbortSignal;
};

/**
 * Calls the API and returns the `data` part of the `{ data, meta }` envelope.
 * Any non-2xx response, or a network failure, throws an ApiError.
 */
export async function apiFetch<T>(path: string, options: Options = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let res: Response;
  try {
    res = await fetch(`${env.apiUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection and try again.");
  }

  let json: { data?: T; error?: string; code?: string; requestId?: string } | null = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const retryAfter = Number(res.headers.get("Retry-After"));
    throw new ApiError(
      res.status,
      json?.code ?? "UNKNOWN",
      json?.error ?? "Something went wrong. Please try again.",
      json?.requestId,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
  return json?.data as T;
}
