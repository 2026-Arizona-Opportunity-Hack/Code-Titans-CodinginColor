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
      },
    });
    ctx.tables.content.grantReadWriteData(fn);
    ctx.tables.core.grantReadData(fn); // the canAuthor flag
    addRoutes(
      ctx,
      fn,
      [
        "GET /v1/curriculum/modules",
        "POST /v1/curriculum/modules",
        "GET /v1/curriculum/modules/{moduleId}",
      ],
      ctx.staffAuthorizer,
    );
  }
}
