import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { createPythonFunction } from "../lambda-factory";
import { DomainContext, addRoutes } from "./context";

/** Must match the ROUTES dict in lambda/reports-api/index.py (checked by test/routes.test.ts). */
export const REPORTS_ROUTES = [
  "GET /v1/classes/{classId}/progress",
  "GET /v1/classes/{classId}/students/{studentId}/progress",
  "GET /v1/classes/{classId}/attention",
  "GET /v1/classes/{classId}/modules/{moduleId}/gain",
  "GET /v1/classes/{classId}/concepts",
  "GET /v1/classes/{classId}/review-queue",
  "PUT /v1/classes/{classId}/submissions/{submissionId}/review",
  "GET /v1/classes/{classId}/export",
  "GET /v1/admin/cohorts/{cohortId}/summary",
];

/**
 * api.md section 5: instructor dashboards, gain reports, review queue, CSV export, and the
 * admin cohort summary. Staff only (Cognito). Class access is checked inside the Lambda.
 */
export class ReportsApi extends Construct {
  constructor(scope: Construct, id: string, ctx: DomainContext) {
    super(scope, id);
    const fn = createPythonFunction(this, "ReportsApiFunction", ctx.defaults, {
      dir: "reports-api",
      description: "Instructor reports and cohort summary",
      timeout: cdk.Duration.seconds(20),
      memorySize: 512,
      environment: {
        CONTENT_TABLE: ctx.tables.content.tableName,
        CORE_TABLE: ctx.tables.core.tableName,
        PROGRESS_TABLE: ctx.tables.progress.tableName,
        EVENTS_TABLE: ctx.tables.events.tableName,
      },
    });
    ctx.tables.content.grantReadData(fn);
    ctx.tables.core.grantReadData(fn);
    ctx.tables.progress.grantReadWriteData(fn); // submission review updates a progress item
    ctx.tables.events.grantWriteData(fn); // audit entries for exports
    addRoutes(ctx, fn, REPORTS_ROUTES, ctx.staffAuthorizer);
  }
}
