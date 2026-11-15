import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import { assignmentHandlers } from "./assignmentHandlers";
import { rosterHandlers } from "./rosterHandlers";
import { staffHandlers } from "./staffHandlers";
import { studentHandlers } from "./studentHandlers";

export const handlers = [
  ...staffHandlers,
  ...rosterHandlers,
  ...assignmentHandlers,
  ...studentHandlers,
  http.get(`${env.apiUrl}/health`, () => HttpResponse.json({ data: { status: "ok" } })),
];
