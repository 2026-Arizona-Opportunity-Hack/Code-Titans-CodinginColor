import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { ApiStack } from "../lib/api-stack";
import { AuthStack } from "../lib/auth-stack";
import { AppConfig, readConfig } from "../lib/config";
import { DataStack } from "../lib/data-stack";

const env = { account: "111111111111", region: "us-east-1" };

function build(context: Record<string, unknown> = { allowedOrigins: "http://localhost:3000" }) {
  const app = new cdk.App({ context });
  const config: AppConfig = readConfig(app);
  const data = new DataStack(app, "Data", { env });
  const auth = new AuthStack(app, "Auth", { env, config });
  const api = new ApiStack(app, "Api", {
    env,
    config,
    data,
    userPool: auth.userPool,
    userPoolClient: auth.userPoolClient,
  });
  return { data: Template.fromStack(data), auth: Template.fromStack(auth), api: Template.fromStack(api) };
}

describe("DataStack", () => {
  const { data } = build();

  test("creates four on-demand tables with PITR, encryption and RETAIN", () => {
    data.resourceCountIs("AWS::DynamoDB::Table", 4);
    data.allResourcesProperties("AWS::DynamoDB::Table", {
      BillingMode: "PAY_PER_REQUEST",
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      SSESpecification: { SSEEnabled: true }, // AWS-managed KMS key, no customer-managed key
    });
    const tables = data.findResources("AWS::DynamoDB::Table");
    for (const t of Object.values(tables)) {
      expect(t.DeletionPolicy).toBe("Retain");
    }
  });

  test("core table has three GSIs and a ttl attribute", () => {
    data.hasResourceProperties("AWS::DynamoDB::Table", {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({ IndexName: "gsi1" }),
        Match.objectLike({ IndexName: "gsi2" }),
        Match.objectLike({ IndexName: "gsi3" }),
      ]),
      TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
    });
  });
});

describe("AuthStack", () => {
  test("is invite-only, TOTP-only, with the three staff groups", () => {
    const { auth } = build();
    auth.hasResourceProperties("AWS::Cognito::UserPool", {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      MfaConfiguration: "ON",
      EnabledMfas: ["SOFTWARE_TOKEN_MFA"],
    });
    auth.resourceCountIs("AWS::Cognito::UserPoolGroup", 3);
  });

  test("MFA can be relaxed through context", () => {
    const { auth } = build({ allowedOrigins: "http://localhost:3000", staffMfa: "OPTIONAL" });
    auth.hasResourceProperties("AWS::Cognito::UserPool", { MfaConfiguration: "OPTIONAL" });
  });
});

describe("ApiStack", () => {
  const { api } = build();

  test("CORS allows only the configured origins", () => {
    api.hasResourceProperties("AWS::ApiGatewayV2::Api", {
      CorsConfiguration: Match.objectLike({ AllowOrigins: ["http://localhost:3000"] }),
    });
  });

  test("exposes a public health route on a Python 3.12 function with the shared layer", () => {
    api.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "GET /v1/health" });
    api.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "python3.12",
      Handler: "index.lambda_handler",
      Layers: Match.anyValue(),
      Timeout: 5,
    });
  });

  test("student routes use the Lambda authorizer with a 60 second cache and simple responses", () => {
    api.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
      AuthorizerType: "REQUEST",
      EnableSimpleResponses: true,
      AuthorizerResultTtlInSeconds: 60,
      IdentitySource: ["$request.header.Authorization"],
    });
    api.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "POST /v1/student/modules/{moduleId}/activities/{activityId}/submit",
      AuthorizationType: "CUSTOM",
    });
  });

  test("reports routes use the Cognito JWT authorizer", () => {
    api.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "GET /v1/classes/{classId}/modules/{moduleId}/gain",
      AuthorizationType: "JWT",
    });
    api.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "GET /v1/admin/cohorts/{cohortId}/summary", AuthorizationType: "JWT" });
  });

  test("read API routes need the API key and are throttled harder", () => {
    api.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
      AuthorizerType: "REQUEST",
      IdentitySource: ["$request.header.X-Api-Key"],
    });
    api.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "GET /v1/read/cohorts", AuthorizationType: "CUSTOM" });
    api.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      RouteSettings: Match.objectLike({ "GET /v1/read/cohorts": { ThrottlingRateLimit: 5, ThrottlingBurstLimit: 10 } }),
    });
  });

  test("no function is granted wildcard DynamoDB actions", () => {
    const policies = JSON.stringify(api.findResources("AWS::IAM::Policy"));
    expect(policies).toContain("dynamodb:PutItem");
    expect(policies).not.toContain('"dynamodb:*"');
  });

  test("throttles by default and logs without IP addresses", () => {
    api.hasResourceProperties("AWS::ApiGatewayV2::Stage", {
      DefaultRouteSettings: { ThrottlingRateLimit: 50, ThrottlingBurstLimit: 100 },
      AccessLogSettings: Match.objectLike({ Format: Match.not(Match.stringLikeRegexp("sourceIp")) }),
    });
  });
});

describe("config", () => {
  test("throws when allowedOrigins is missing", () => {
    expect(() => readConfig(new cdk.App({ context: {} }))).toThrow(/allowedOrigins/);
  });

  test("rejects wildcard and malformed origins", () => {
    expect(() => readConfig(new cdk.App({ context: { allowedOrigins: "*" } }))).toThrow(/Invalid origin/);
    expect(() => readConfig(new cdk.App({ context: { allowedOrigins: "https://x.com/path" } }))).toThrow(/Invalid origin/);
  });
});
