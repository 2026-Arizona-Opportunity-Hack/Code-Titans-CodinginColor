import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { createPythonFunction } from "../lambda-factory";
import { DomainContext, addRoutes } from "./context";

/** Classes and their instructors (docs/api.md section 4). Roster and assignments are added here. */
export class ClassesDomain extends Construct {
  constructor(scope: Construct, id: string, ctx: DomainContext) {
    super(scope, id);
    const fn = createPythonFunction(this, "ClassApiFunction", ctx.defaults, {
      dir: "class-api",
      description: "Classes, roster and assignments",
      timeout: cdk.Duration.seconds(15),
      environment: {
        CORE_TABLE: ctx.tables.core.tableName,
        CONTENT_TABLE: ctx.tables.content.tableName,
        PROGRESS_TABLE: ctx.tables.progress.tableName,
        USER_POOL_ID: ctx.userPool.userPoolId,
      },
    });
    ctx.tables.core.grantReadWriteData(fn);
    ctx.tables.content.grantReadData(fn);
    // Only to delete a student's progress along with the student.
    ctx.tables.progress.grant(fn, "dynamodb:Query", "dynamodb:BatchWriteItem", "dynamodb:DeleteItem");
    ctx.userPool.grant(fn, "cognito-idp:AdminListGroupsForUser"); // checks a member is an instructor
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
      ],
      ctx.staffAuthorizer,
    );
  }
}
