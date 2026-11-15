import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { createPythonFunction } from "../lambda-factory";
import { DomainContext, addRoutes } from "./context";

/**
 * Staff identity and admin routes (docs/api.md sections 1 and 2), all behind the
 * Cognito JWT authorizer. Each handler checks the role itself (`require_admin`).
 */
export class AdminDomain extends Construct {
  constructor(scope: Construct, id: string, ctx: DomainContext) {
    super(scope, id);
    const fn = createPythonFunction(this, "AdminApiFunction", ctx.defaults, {
      dir: "admin-api",
      description: "Staff identity and admin routes",
      timeout: cdk.Duration.seconds(10),
      environment: { CORE_TABLE: ctx.tables.core.tableName },
    });
    ctx.tables.core.grantReadWriteData(fn);
    addRoutes(
      ctx,
      fn,
      [
        "GET /v1/me",
        "GET /v1/admin/orgs",
        "POST /v1/admin/orgs",
        "PATCH /v1/admin/orgs/{orgId}",
        "GET /v1/admin/cohorts",
        "POST /v1/admin/cohorts",
        "PATCH /v1/admin/cohorts/{cohortId}",
      ],
      ctx.staffAuthorizer,
    );
  }
}
