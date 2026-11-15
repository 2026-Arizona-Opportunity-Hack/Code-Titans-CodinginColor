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
  const api = new ApiStack(app, "Api", {
    env, config, data, userPool: auth.userPool, userPoolClient: auth.userPoolClient,
  });
  return Template.fromStack(api);
}

describe("StudentAuthDomain", () => {
  const t = apiTemplate();

  test("login is public, logout uses the student Lambda authorizer", () => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "POST /v1/auth/student/login",
      AuthorizationType: "NONE",
    });
    t.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "POST /v1/auth/student/logout",
      AuthorizationType: "CUSTOM",
    });
  });

  test("authorizer returns simple responses and caches for 60 seconds", () => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
      AuthorizerType: "REQUEST",
      EnableSimpleResponses: true,
      AuthorizerResultTtlInSeconds: 60,
      IdentitySource: ["$request.header.Authorization"],
    });
  });

  test("login has a tighter throttle than the stage default", () => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      RouteSettings: Match.objectLike({
        "POST /v1/auth/student/login": { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10 },
      }),
    });
  });

  test("the pepper is retained and only the login function can read it", () => {
    const secrets = t.findResources("AWS::SecretsManager::Secret");
    expect(Object.keys(secrets)).toHaveLength(1);
    expect(Object.values(secrets)[0].DeletionPolicy).toBe("Retain");
    const policies = JSON.stringify(t.findResources("AWS::IAM::Policy"));
    expect(policies.match(/secretsmanager:GetSecretValue/g)).toHaveLength(1);
  });

  test("the authorizer function has no write access to DynamoDB", () => {
    const policies = Object.values(t.findResources("AWS::IAM::Policy")) as any[];
    const authorizerPolicy = policies.find((p) => JSON.stringify(p).includes("AuthorizerFunction"));
    expect(JSON.stringify(authorizerPolicy)).not.toMatch(/dynamodb:(PutItem|UpdateItem|DeleteItem)/);
  });
});

describe("AdminDomain", () => {
  const t = apiTemplate();

  test.each([
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
  ])("%s requires the Cognito JWT authorizer", (routeKey) => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: routeKey, AuthorizationType: "JWT" });
  });

  test("the admin function can manage users but not delete the pool or change its settings", () => {
    const policies = JSON.stringify(t.findResources("AWS::IAM::Policy"));
    expect(policies).toContain("cognito-idp:AdminCreateUser");
    expect(policies).not.toMatch(/cognito-idp:(DeleteUserPool|UpdateUserPool|\*)/);
  });
});

describe("ClassesDomain", () => {
  const t = apiTemplate();

  test.each([
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
  ])("%s requires the Cognito JWT authorizer", (routeKey) => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: routeKey, AuthorizationType: "JWT" });
  });

  test("the class function reads content but cannot write it", () => {
    const policies = Object.values(t.findResources("AWS::IAM::Policy")) as any[];
    const p = JSON.stringify(policies.find((x) => JSON.stringify(x).includes("ClassApiFunction")));
    expect(p).toContain("cognito-idp:AdminListGroupsForUser");
    expect(p).not.toContain("cognito-idp:AdminCreateUser");
  });
});
