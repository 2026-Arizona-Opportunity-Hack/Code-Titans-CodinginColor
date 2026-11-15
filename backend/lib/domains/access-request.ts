import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { createPythonFunction } from "../lambda-factory";
import { DomainContext, addRoutes, throttleRoute } from "./context";

/** Must match the ROUTES dict in lambda/access-request/index.py (checked by test/routes.test.ts). */
export const ACCESS_REQUEST_ROUTES = ["POST /v1/auth/external/request-access"];

/**
 * A teacher outside CIC asks for an account (docs/api.md section 1). The route is public, so it is
 * throttled hard at the gateway, and its function can only add a request and count pending ones.
 * It cannot read requests back, create users, or touch any other table.
 */
export class AccessRequestApi extends Construct {
  constructor(scope: Construct, id: string, ctx: DomainContext) {
    super(scope, id);
    const fn = createPythonFunction(this, "AccessRequestFunction", ctx.defaults, {
      dir: "access-request",
      description: "Public request for an external teacher account",
      timeout: cdk.Duration.seconds(5),
      environment: { CORE_TABLE: ctx.tables.core.tableName },
    });
    ctx.tables.core.grant(fn, "dynamodb:PutItem", "dynamodb:Query");
    addRoutes(ctx, fn, ACCESS_REQUEST_ROUTES);
    for (const routeKey of ACCESS_REQUEST_ROUTES) throttleRoute(ctx, routeKey, 2, 5);
  }
}
