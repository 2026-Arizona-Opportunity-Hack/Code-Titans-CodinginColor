import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { ApiStack } from "../lib/api-stack";
import { AuthStack } from "../lib/auth-stack";
import { readConfig } from "../lib/config";
import { DataStack } from "../lib/data-stack";

const env = { account: "111111111111", region: "us-east-1" };

function apiTemplate(): Template {
  const app = new cdk.App({ context: { allowedOrigins: "http://localhost:3000" } });
  const config = readConfig(app);
  const data = new DataStack(app, "Data", { env });
  const auth = new AuthStack(app, "Auth", { env, config });
  return Template.fromStack(new ApiStack(app, "Api", { env, config, data, userPool: auth.userPool, userPoolClient: auth.userPoolClient }));
}

describe("ReportsApi", () => {
  const t = apiTemplate();

  test("report routes use the Cognito JWT authorizer, including the admin cohort summary", () => {
    for (const key of ["GET /v1/classes/{classId}/modules/{moduleId}/gain", "GET /v1/classes/{classId}/export", "GET /v1/admin/cohorts/{cohortId}/summary"]) {
      t.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: key, AuthorizationType: "JWT" });
    }
  });
});

describe("StudentPlayerApi", () => {
  const t = apiTemplate();

  test("every student route uses the student session authorizer", () => {
    for (const key of [
      "GET /v1/student/home",
      "GET /v1/student/modules/{moduleId}",
      "POST /v1/student/modules/{moduleId}/activities/{activityId}/submit",
      "PUT /v1/student/modules/{moduleId}/activities/{activityId}/draft",
    ]) {
      t.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: key, AuthorizationType: "CUSTOM" });
    }
  });

  test("heartbeats have their own throttle", () => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      RouteSettings: Match.objectLike({
        "POST /v1/student/modules/{moduleId}/activities/{activityId}/heartbeat": { ThrottlingRateLimit: 30, ThrottlingBurstLimit: 60 },
      }),
    });
  });

  test("no function is granted wildcard DynamoDB actions", () => {
    expect(JSON.stringify(t.findResources("AWS::IAM::Policy"))).not.toContain('"dynamodb:*"');
  });
});
