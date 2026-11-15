import { http, HttpResponse } from "msw";
import { env } from "../config/env";
import { adminHandlers } from "./adminHandlers";
import { assignmentHandlers } from "./assignmentHandlers";
import { curriculumHandlers } from "./curriculumHandlers";
import { reportHandlers } from "./reportHandlers";
import { rosterHandlers } from "./rosterHandlers";
import { staffHandlers } from "./staffHandlers";
import { studentHandlers } from "./studentHandlers";

export const handlers = [
  ...staffHandlers,
  ...adminHandlers,
  ...rosterHandlers,
  ...assignmentHandlers,
  ...curriculumHandlers,
  ...reportHandlers,
  ...studentHandlers,
  http.get(`${env.apiUrl}/health`, () => HttpResponse.json({ data: { status: "ok" } })),
];
