import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { createPythonFunction } from "../lambda-factory";
import { createApiKeyAuthorizer } from "./authorizers";
import { DomainContext, addRoutes, throttleRoute } from "./context";

/** Must match the ROUTES dict in lambda/read-api/index.py (checked by test/routes.test.ts). */
export const READ_ROUTES = [
  "GET /v1/read/cohorts",
  "GET /v1/read/cohorts/{cohortId}/summary",
  "GET /v1/read/classes/{classId}/summary",
  "GET /v1/read/modules/{moduleId}/gain",
  "GET /v1/read/concepts/gain",
  "GET /v1/read/progress",
];

/**
 * api.md section 7: read-only aggregates for CIC's org dashboard, behind an API key.
 * The function has read access only and the routes are throttled harder than the app.
 */
export class ReadApi extends Construct {
  constructor(scope: Construct, id: string, ctx: DomainContext) {
    super(scope, id);
    const fn = createPythonFunction(this, "ReadApiFunction", ctx.defaults, {
      dir: "read-api",
      description: "Aggregated cohort stats for the CIC dashboard",
      timeout: cdk.Duration.seconds(25),
      memorySize: 512,
      environment: {
        CONTENT_TABLE: ctx.tables.content.tableName,
        CORE_TABLE: ctx.tables.core.tableName,
        PROGRESS_TABLE: ctx.tables.progress.tableName,
      },
    });
    ctx.tables.content.grantReadData(fn);
    ctx.tables.core.grantReadData(fn);
    ctx.tables.progress.grantReadData(fn);
    addRoutes(ctx, fn, READ_ROUTES, createApiKeyAuthorizer(this, ctx.defaults, ctx.tables.core));
    for (const routeKey of READ_ROUTES) {
      throttleRoute(ctx, routeKey, 5, 10);
    }
  }
}
