// Typed access to the NEXT_PUBLIC_ environment variables (see ../../.env.example).
// Next.js inlines these at build time, so each one must be read as a literal
// `process.env.NEXT_PUBLIC_NAME` expression. Nothing secret belongs here.

export const env = {
  /** Development switch: answer API calls in the browser with MSW instead of calling the API. Keep it off in any published build. */
  useMocks: process.env.NEXT_PUBLIC_USE_MOCKS === "true",

  /** API base URL including /v1, without a trailing slash. */
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? "https://mock.cic.local/v1").replace(/\/$/, ""),

  /** Where Pyodide (Python in the browser, about 12 MB) is loaded from, with a trailing slash. Self-host it by setting this. */
  pyodideUrl: (process.env.NEXT_PUBLIC_PYODIDE_URL ?? "https://cdn.jsdelivr.net/pyodide/v314.0.8/full").replace(/\/?$/, "/"),
  awsRegion: process.env.NEXT_PUBLIC_AWS_REGION ?? "",
  userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "",
  userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
} as const;
