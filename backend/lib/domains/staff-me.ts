import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { createPythonFunction } from "../lambda-factory";
import { DomainContext, addRoutes } from "./context";

/** GET /v1/me: who the signed-in staff user is, their role, canAuthor flag and classes. */
export class StaffMeDomain extends Construct {
  constructor(scope: Construct, id: string, ctx: DomainContext) {
    super(scope, id);
    const fn = createPythonFunction(this, "AdminApiFunction", ctx.defaults, {
      dir: "admin-api",
      description: "Staff identity (/me)",
      timeout: cdk.Duration.seconds(10),
      environment: { CORE_TABLE: ctx.tables.core.tableName },
    });
    ctx.tables.core.grantReadData(fn);
    addRoutes(ctx, fn, ["GET /v1/me"], ctx.staffAuthorizer);
  }
}
