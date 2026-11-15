import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
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
      timeout: cdk.Duration.seconds(120), // the worksheet converter waits on the AI in a background run
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
    ctx.assets.bucket.grantRead(fn, "curriculum/*"); // the converter reads the uploaded worksheet or deck
    // The converter runs itself in the background, because the AI takes longer than API Gateway allows.
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["lambda:InvokeFunction"],
      resources: [cdk.Arn.format({ service: "lambda", resource: "function", resourceName: "CicCurriculumApiStack-CurriculumCurriculumApiFunct*", arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME }, cdk.Stack.of(this))],
    }));
    // Claude Haiku 4.5, with Nova Pro as a fallback, through US cross-region inference profiles.
    const stack = cdk.Stack.of(this);
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel"],
      resources: [
        `arn:aws:bedrock:${stack.region}:${stack.account}:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0`,
        `arn:aws:bedrock:${stack.region}:${stack.account}:inference-profile/us.amazon.nova-pro-v1:0`,
        // A US inference profile can route to any of these regions.
        ...["us-east-1", "us-east-2", "us-west-2"].flatMap((r) => [
          `arn:aws:bedrock:${r}::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0`,
          `arn:aws:bedrock:${r}::foundation-model/amazon.nova-pro-v1:0`,
        ]),
      ],
    }));
    addRoutes(
      ctx,
      fn,
      [
        "GET /v1/curriculum/modules",
        "POST /v1/curriculum/modules",
        "GET /v1/curriculum/modules/{moduleId}",
        "DELETE /v1/curriculum/modules/{moduleId}",
        "GET /v1/curriculum/modules/{moduleId}/classes",
        "POST /v1/curriculum/modules/from-file",
        "GET /v1/curriculum/conversions/{jobId}",
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
