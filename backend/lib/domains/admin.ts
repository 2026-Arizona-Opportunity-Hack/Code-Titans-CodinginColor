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
      environment: {
        CORE_TABLE: ctx.tables.core.tableName,
        EVENTS_TABLE: ctx.tables.events.tableName,
        USER_POOL_ID: ctx.userPool.userPoolId,
      },
    });
    ctx.tables.core.grantReadWriteData(fn);
    ctx.tables.events.grantReadWriteData(fn); // audit entries for key changes, and the audit list
    // Only the Cognito calls the user routes make, on this pool only.
    ctx.userPool.grant(
      fn,
      "cognito-idp:AdminCreateUser",
      "cognito-idp:AdminDeleteUser",
      "cognito-idp:AdminGetUser",
      "cognito-idp:AdminAddUserToGroup",
      "cognito-idp:AdminRemoveUserFromGroup",
      "cognito-idp:AdminListGroupsForUser",
      "cognito-idp:AdminDisableUser",
      "cognito-idp:AdminEnableUser",
      "cognito-idp:AdminUserGlobalSignOut",
      "cognito-idp:ListUsers",
      "cognito-idp:ListUsersInGroup",
    );
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
        "GET /v1/admin/users",
        "POST /v1/admin/users",
        "PATCH /v1/admin/users/{userId}",
        "GET /v1/admin/api-keys",
        "POST /v1/admin/api-keys",
        "DELETE /v1/admin/api-keys/{keyId}",
        "GET /v1/admin/audit",
      ],
      ctx.staffAuthorizer,
    );
  }
}
