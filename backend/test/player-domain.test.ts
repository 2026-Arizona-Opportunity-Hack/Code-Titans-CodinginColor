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

describe("ReadApi", () => {
  const t = apiTemplate();

  test("read routes need the API key and are throttled to 5 per second", () => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", { AuthorizerType: "REQUEST", IdentitySource: ["$request.header.X-Api-Key"] });
    t.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "GET /v1/read/cohorts", AuthorizationType: "CUSTOM" });
    t.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      RouteSettings: Match.objectLike({ "GET /v1/read/progress": { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10 } }),
    });
  });

  test("API key and audit admin routes use the Cognito JWT authorizer", () => {
    for (const key of ["GET /v1/admin/api-keys", "POST /v1/admin/api-keys", "DELETE /v1/admin/api-keys/{keyId}", "GET /v1/admin/audit"]) {
      t.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: key, AuthorizationType: "JWT" });
    }
  });
});

describe("student hints", () => {
  const t = apiTemplate();

  test("the route uses the student authorizer and has its own throttle", () => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "POST /v1/student/hints", AuthorizationType: "CUSTOM" });
    t.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      RouteSettings: Match.objectLike({ "POST /v1/student/hints": { ThrottlingRateLimit: 10, ThrottlingBurstLimit: 20 } }),
    });
  });

  test("the function may invoke exactly one model, and nothing else in Bedrock", () => {
    const statements = (Object.values(t.findResources("AWS::IAM::Policy")) as any[]).flatMap((p) => p.Properties.PolicyDocument.Statement);
    const bedrock = statements.filter((s) => JSON.stringify(s.Action).includes("bedrock:"));
    expect(bedrock).toHaveLength(1);
    expect(bedrock[0].Action).toBe("bedrock:InvokeModel");
    expect(JSON.stringify(bedrock[0].Resource)).toContain("foundation-model/amazon.nova-lite-v1:0");
    expect(JSON.stringify(bedrock[0].Resource)).not.toContain("*");
  });

  test("model, region and the monthly cap reach the function", () => {
    t.hasResourceProperties("AWS::Lambda::Function", {
      Description: Match.stringLikeRegexp("hints"),
      Environment: { Variables: Match.objectLike({ BEDROCK_REGION: "us-west-2", HINT_MODEL_ID: "amazon.nova-lite-v1:0", HINTS_MONTHLY_CAP: "5000", HINTS_PER_DAY: "10" }) },
    });
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
