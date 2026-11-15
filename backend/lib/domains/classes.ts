import * as cdk from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { createPythonFunction } from "../lambda-factory";
import { DomainContext, addRoutes } from "./context";

/** Classes and their instructors (docs/api.md section 4). Roster and assignments are added here. */
export class ClassesDomain extends Construct {
  constructor(scope: Construct, id: string, ctx: DomainContext, pepper: secretsmanager.ISecret) {
    super(scope, id);
    // Where students open the login page: the first non-localhost allowed origin (the hosted
    // app), else localhost for local development. Used to build the login sheet link.
    const origins = ctx.defaults.allowedOrigins;
    const appUrl = origins.find((o) => !o.includes("localhost")) ?? origins[0];
    const fn = createPythonFunction(this, "ClassApiFunction", ctx.defaults, {
      dir: "class-api",
      description: "Classes, roster and assignments",
      timeout: cdk.Duration.seconds(30), // issuing words for a whole class updates each student
      environment: {
        CORE_TABLE: ctx.tables.core.tableName,
        CONTENT_TABLE: ctx.tables.content.tableName,
        PROGRESS_TABLE: ctx.tables.progress.tableName,
        EVENTS_TABLE: ctx.tables.events.tableName,
        USER_POOL_ID: ctx.userPool.userPoolId,
        APP_URL: appUrl,
        PEPPER_SECRET_ARN: pepper.secretArn, // adding a student, issuing words and importing all hash credentials
      },
    });
    ctx.tables.core.grantReadWriteData(fn);
    ctx.tables.content.grantReadData(fn);
    pepper.grantRead(fn);
    // Query: count who started a module. Batch/Delete: remove a deleted student's progress.
    ctx.tables.progress.grant(fn, "dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:BatchWriteItem", "dynamodb:DeleteItem");
    ctx.tables.events.grant(fn, "dynamodb:PutItem"); // audit entries
    ctx.userPool.grant(fn, "cognito-idp:AdminListGroupsForUser", "cognito-idp:AdminGetUser"); // instructor check, and names for the class list
    addRoutes(
      ctx,
      fn,
      [
        "POST /v1/classes",
        "GET /v1/classes",
        "GET /v1/classes/{classId}",
        "PATCH /v1/classes/{classId}",
        "POST /v1/classes/{classId}/members",
        "GET /v1/classes/{classId}/roster",
        "POST /v1/classes/{classId}/roster",
        "GET /v1/classes/{classId}/roster/duplicates",
        "PATCH /v1/classes/{classId}/roster/{studentId}",
        "DELETE /v1/classes/{classId}/roster/{studentId}",
        "GET /v1/students/{studentId}",
        "POST /v1/classes/{classId}/roster/{studentId}/merge",
        "GET /v1/students",
        "POST /v1/classes/{classId}/roster/import",
        "POST /v1/classes/{classId}/credentials",
        "POST /v1/classes/{classId}/join-code/rotate",
        "POST /v1/classes/{classId}/assignments",
        "GET /v1/classes/{classId}/assignments",
        "PATCH /v1/classes/{classId}/assignments/{moduleId}",
        "DELETE /v1/classes/{classId}/assignments/{moduleId}",
        "POST /v1/classes/{classId}/students/{studentId}/unlock",
      ],
      ctx.staffAuthorizer,
    );
  }
}
