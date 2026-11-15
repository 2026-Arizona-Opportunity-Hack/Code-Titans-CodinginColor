import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { createPythonFunction } from "../lambda-factory";
import { DomainContext, addRoutes } from "./context";

/**
 * Curriculum authoring and review (docs/api.md section 3). Every route checks the role
 * itself: admins and authors (instructors with canAuthor) write, all staff read.
 */
export class CurriculumDomain extends Construct {
  constructor(scope: Construct, id: string, ctx: DomainContext) {
    super(scope, id);
    const fn = createPythonFunction(this, "CurriculumApiFunction", ctx.defaults, {
      dir: "curriculum-api",
      description: "Curriculum modules: authoring, publishing, review",
      timeout: cdk.Duration.seconds(15),
      environment: {
        CORE_TABLE: ctx.tables.core.tableName,
        CONTENT_TABLE: ctx.tables.content.tableName,
        EVENTS_TABLE: ctx.tables.events.tableName,
        PROGRESS_TABLE: ctx.tables.progress.tableName,
        ASSETS_BUCKET: ctx.assets.bucket.bucketName,
        ASSETS_URL: `https://${ctx.assets.cdnDomain}`,
      },
    });
    ctx.tables.content.grantReadWriteData(fn);
    ctx.tables.core.grantReadData(fn); // the canAuthor flag, and which classes use a module before deleting it
    ctx.tables.core.grant(fn, "dynamodb:UpdateItem"); // publishing moves the author's classes to the new version
    ctx.tables.events.grant(fn, "dynamodb:PutItem"); // audit entries
    ctx.tables.progress.grant(fn, "dynamodb:Query"); // how many students started a module, per class
    ctx.assets.bucket.grantPut(fn, "curriculum/*"); // signs upload forms for this prefix only
    addRoutes(
      ctx,
      fn,
      [
        "GET /v1/curriculum/modules",
        "POST /v1/curriculum/modules",
        "GET /v1/curriculum/modules/{moduleId}",
        "DELETE /v1/curriculum/modules/{moduleId}",
        "GET /v1/curriculum/modules/{moduleId}/classes",
        "PUT /v1/curriculum/modules/{moduleId}/draft",
        "POST /v1/curriculum/modules/{moduleId}/publish",
        "GET /v1/curriculum/modules/{moduleId}/versions",
        "GET /v1/curriculum/modules/{moduleId}/versions/{version}",
        "GET /v1/curriculum/concepts",
        "POST /v1/curriculum/assets/upload-url",
      ],
      ctx.staffAuthorizer,
    );
  }
}
