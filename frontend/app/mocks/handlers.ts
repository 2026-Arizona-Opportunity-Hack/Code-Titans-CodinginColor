import { http, HttpResponse } from "msw";
import { env } from "../config/env";

// Fake API responses, shaped exactly like docs/api.md (envelope: { data, meta }).
// More handlers are added as each screen is built.
export const handlers = [
  http.get(`${env.apiUrl}/health`, () => HttpResponse.json({ data: { status: "ok" } })),
];
