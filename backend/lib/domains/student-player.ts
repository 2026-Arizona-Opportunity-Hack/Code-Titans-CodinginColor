import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { createPythonFunction } from "../lambda-factory";
import { DomainContext, addRoutes } from "./context";

const HEARTBEAT_ROUTE = "POST /v1/student/modules/{moduleId}/activities/{activityId}/heartbeat";

/** Must match the ROUTES dict in lambda/student-api/index.py (checked by test/routes.test.ts). */
export const STUDENT_ROUTES = [
  "GET /v1/student/home",
  "GET /v1/student/modules/{moduleId}",
  "PUT /v1/student/modules/{moduleId}/activities/{activityId}/draft",
  HEARTBEAT_ROUTE,
  "POST /v1/student/modules/{moduleId}/activities/{activityId}/submit",
  "POST /v1/student/modules/{moduleId}/activities/{activityId}/complete",
];

/** api.md section 6: the student player. Callers are students, authenticated by session token. */
export class StudentPlayerApi extends Construct {
  constructor(scope: Construct, id: string, ctx: DomainContext) {
    super(scope, id);
    const fn = createPythonFunction(this, "StudentApiFunction", ctx.defaults, {
      dir: "student-api",
      description: "Student player: home, module, submit, heartbeat, drafts",
      timeout: cdk.Duration.seconds(10),
      environment: {
        CONTENT_TABLE: ctx.tables.content.tableName,
        CORE_TABLE: ctx.tables.core.tableName,
        PROGRESS_TABLE: ctx.tables.progress.tableName,
      },
    });
    ctx.tables.content.grantReadData(fn);
    ctx.tables.core.grantReadData(fn);
    ctx.tables.progress.grantReadWriteData(fn);
    addRoutes(ctx, fn, STUDENT_ROUTES, ctx.studentAuthorizer);
    // Heartbeats are the chatty route (one per student every 30 seconds). A cap of 30 per second
    // covers about 900 students at once and limits a runaway client.
    ctx.throttles[HEARTBEAT_ROUTE] = { rate: 30, burst: 60 };
  }
}
