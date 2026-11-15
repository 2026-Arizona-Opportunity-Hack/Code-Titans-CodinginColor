import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import { assignmentHandlers } from "./assignmentHandlers";
import { reportHandlers } from "./reportHandlers";
import { rosterHandlers } from "./rosterHandlers";
import { staffHandlers } from "./staffHandlers";
import { studentHandlers } from "./studentHandlers";

export const handlers = [
  ...staffHandlers,
  ...rosterHandlers,
  ...assignmentHandlers,
  ...reportHandlers,
  ...studentHandlers,
  http.get(`${env.apiUrl}/health`, () => HttpResponse.json({ data: { status: "ok" } })),
];
