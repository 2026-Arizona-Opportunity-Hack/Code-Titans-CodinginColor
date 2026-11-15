import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { AppConfig } from "../config";
import { createPythonFunction } from "../lambda-factory";
import { DomainContext, addRoutes, throttleRoute } from "./context";

const HINTS_ROUTE = "POST /v1/student/hints";
const HEARTBEAT_ROUTE = "POST /v1/student/modules/{moduleId}/activities/{activityId}/heartbeat";

/** Must match the ROUTES dict in lambda/student-api/index.py (checked by test/routes.test.ts). */
export const STUDENT_ROUTES = [
  "GET /v1/student/home",
  "GET /v1/student/modules/{moduleId}",
  "PUT /v1/student/modules/{moduleId}/activities/{activityId}/draft",
  HEARTBEAT_ROUTE,
  "POST /v1/student/modules/{moduleId}/activities/{activityId}/submit",
  "POST /v1/student/modules/{moduleId}/activities/{activityId}/complete",
  HINTS_ROUTE,
];

/**
 * docs/api.md section 6: the student player. Callers are students, authenticated by the
 * session authorizer that StudentAuthDomain creates.
 */
export class StudentPlayerApi extends Construct {
  constructor(scope: Construct, id: string, ctx: DomainContext, studentAuthorizer: apigwv2.IHttpRouteAuthorizer, config: AppConfig) {
    super(scope, id);
    const fn = createPythonFunction(this, "StudentApiFunction", ctx.defaults, {
      dir: "student-api",
      description: "Student player: home, module, submit, heartbeat, drafts, hints",
      timeout: cdk.Duration.seconds(15), // a hint waits for the model (up to 8 seconds)
      environment: {
        CONTENT_TABLE: ctx.tables.content.tableName,
        CORE_TABLE: ctx.tables.core.tableName,
        PROGRESS_TABLE: ctx.tables.progress.tableName,
        EVENTS_TABLE: ctx.tables.events.tableName,
        BEDROCK_REGION: config.bedrockRegion,
        HINT_MODEL_ID: config.hintModelId,
        HINTS_MONTHLY_CAP: String(config.hintsMonthlyCap),
        HINTS_PER_DAY: "10",
      },
    });
    ctx.tables.content.grantReadData(fn);
    ctx.tables.core.grantReadData(fn);
    ctx.tables.progress.grantReadWriteData(fn);
    ctx.tables.events.grantReadWriteData(fn); // hint counters and the teacher-reviewable hint log
    // Hints call one model, named exactly. No wildcard, and no other model or action.
    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel"],
      resources: [cdk.Arn.format({ service: "bedrock", region: config.bedrockRegion, account: "", resource: "foundation-model", resourceName: config.hintModelId }, cdk.Stack.of(this))],
    }));
    addRoutes(ctx, fn, STUDENT_ROUTES, studentAuthorizer);
    // Heartbeats are the chatty route (one per student every 30 seconds). A cap of 30 per second
    // covers about 900 students at once and limits a runaway client.
    throttleRoute(ctx, HEARTBEAT_ROUTE, 30, 60);
    throttleRoute(ctx, HINTS_ROUTE, 10, 20); // each call waits on the model, and a student has a daily limit anyway
  }
}
