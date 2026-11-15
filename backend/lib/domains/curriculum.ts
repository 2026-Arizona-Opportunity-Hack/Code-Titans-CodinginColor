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
        ASSETS_BUCKET: ctx.assets.bucket.bucketName,
        ASSETS_URL: `https://${ctx.assets.cdnDomain}`,
      },
    });
    ctx.tables.content.grantReadWriteData(fn);
    ctx.tables.core.grantReadData(fn); // the canAuthor flag
    ctx.assets.bucket.grantPut(fn, "curriculum/*"); // signs upload forms for this prefix only
    addRoutes(
      ctx,
      fn,
      [
        "GET /v1/curriculum/modules",
        "POST /v1/curriculum/modules",
        "GET /v1/curriculum/modules/{moduleId}",
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
