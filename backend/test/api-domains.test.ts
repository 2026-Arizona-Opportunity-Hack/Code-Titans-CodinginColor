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

  test("the pepper is retained and only the login and class functions can read it", () => {
    const secrets = t.findResources("AWS::SecretsManager::Secret");
    expect(Object.keys(secrets)).toHaveLength(1);
    expect(Object.values(secrets)[0].DeletionPolicy).toBe("Retain");
    const policies = JSON.stringify(t.findResources("AWS::IAM::Policy"));
    expect(policies.match(/secretsmanager:GetSecretValue/g)).toHaveLength(2);
  });

  test("every function that hashes student words is told where the pepper is", () => {
    // Tests set CREDENTIAL_PEPPER, so only the stack can catch a function that has no way to find it in AWS.
    for (const description of ["Student login and logout", "Classes, roster and assignments"]) {
      t.hasResourceProperties("AWS::Lambda::Function", {
        Description: description,
        Environment: { Variables: Match.objectLike({ PEPPER_SECRET_ARN: Match.anyValue() }) },
      });
    }
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
    "POST /v1/classes/{classId}/roster/{studentId}/merge",
    "GET /v1/students",
    "POST /v1/classes/{classId}/roster/import",
    "POST /v1/classes/{classId}/credentials",
    "POST /v1/classes/{classId}/join-code/rotate",
    "POST /v1/classes/{classId}/assignments",
    "GET /v1/classes/{classId}/assignments",
    "PATCH /v1/classes/{classId}/assignments/{moduleId}",
    "DELETE /v1/classes/{classId}/assignments/{moduleId}",
    "POST /v1/classes/{classId}/students/{studentId}/unlock",
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

describe("CurriculumDomain", () => {
  const t = apiTemplate();

  test.each([
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
  ])("%s requires the Cognito JWT authorizer", (routeKey) => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: routeKey, AuthorizationType: "JWT" });
  });

  test("the curriculum function can write content but only read the core table", () => {
    const policies = Object.values(t.findResources("AWS::IAM::Policy")) as any[];
    const policy = policies.find((x) => JSON.stringify(x).includes("CurriculumApiFunction"));
    const statements = [].concat(policy.Properties.PolicyDocument.Statement) as any[];
    const actionsFor = (table: string) =>
      statements
        .filter((st) => JSON.stringify(st.Resource).includes(table))
        .flatMap((st) => [].concat(st.Action));
    expect(actionsFor("ContentTable")).toContain("dynamodb:PutItem");
    expect(actionsFor("CoreTable")).toContain("dynamodb:GetItem");
    expect(actionsFor("CoreTable")).not.toContain("dynamodb:PutItem");
  });
});

describe("Curriculum assets", () => {
  function dataTemplate(): Template {
    const app = new cdk.App({ context: { allowedOrigins: "http://localhost:3000" } });
    return Template.fromStack(new DataStack(app, "Data", { env, allowedOrigins: ["http://localhost:3000"] }));
  }

  test("the bucket is private, encrypted, TLS-only and retained, with CORS for uploads", () => {
    const d = dataTemplate();
    d.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
      BucketEncryption: Match.anyValue(),
      CorsConfiguration: { CorsRules: [Match.objectLike({ AllowedMethods: ["POST"], AllowedOrigins: ["http://localhost:3000"] })] },
    });
    d.hasResource("AWS::S3::Bucket", { DeletionPolicy: "Retain" });
    expect(JSON.stringify(d.findResources("AWS::S3::BucketPolicy"))).toContain("aws:SecureTransport");
  });

  test("images are served through CloudFront with origin access control, not public S3", () => {
    const d = dataTemplate();
    d.resourceCountIs("AWS::CloudFront::OriginAccessControl", 1);
    d.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({ DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: "redirect-to-https" }) }),
    });
  });

  test("the curriculum function can only put objects under curriculum/", () => {
    const policies = Object.values(apiTemplate().findResources("AWS::IAM::Policy")) as any[];
    const policy = policies.find((x) => JSON.stringify(x).includes("CurriculumApiFunction"));
    const s3Statements = ([] as any[]).concat(policy.Properties.PolicyDocument.Statement)
      .filter((st) => ([] as any[]).concat(st.Action).some((a: string) => a.startsWith("s3:")));
    const actions = s3Statements.flatMap((st) => ([] as any[]).concat(st.Action));
    expect(actions).toContain("s3:PutObject");
    expect(actions).not.toContain("s3:GetObject");
    expect(actions).not.toContain("s3:DeleteObject");
    expect(JSON.stringify(s3Statements)).toContain("/curriculum/*");
  });
});

describe("ApiStack stage", () => {
  test("the stage is created after every route, because it has per-route throttle settings", () => {
    const t = apiTemplate();
    const stage = Object.values(t.findResources("AWS::ApiGatewayV2::Stage"))[0] as any;
    const routes = Object.keys(t.findResources("AWS::ApiGatewayV2::Route"));
    expect(routes.length).toBeGreaterThan(50);
    for (const id of routes) expect(stage.DependsOn).toContain(id);
  });
});
