import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaAuthorizer, HttpLambdaResponseType } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import { createPythonFunction } from "../lambda-factory";
import { DomainContext, addRoutes } from "./context";

/**
 * Student sign-in (docs/api.md section 1): class code + secret words, no Cognito.
 *   POST /v1/auth/student/login   public, throttled hard at the gateway
 *   POST /v1/auth/student/logout  student session
 * Also exposes `authorizer`, which every /v1/student/* route reuses.
 */
export class StudentAuthDomain extends Construct {
  public readonly authorizer: apigwv2.IHttpRouteAuthorizer;
  /** The credential pepper. Every function that issues or checks student words needs read access. */
  public readonly pepper: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, ctx: DomainContext) {
    super(scope, id);

    // Mixed into every credential hash. Retained: losing it invalidates every student login.
    const pepper = (this.pepper = new secretsmanager.Secret(this, "CredentialPepper", {
      description: "HMAC pepper for student secret words",
      generateSecretString: { passwordLength: 48, excludePunctuation: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    }));

    const authorizerFn = createPythonFunction(this, "AuthorizerFunction", ctx.defaults, {
      dir: "authorizer-student",
      description: "Resolves a student session token for API Gateway",
      timeout: cdk.Duration.seconds(5),
      environment: { CORE_TABLE: ctx.tables.core.tableName },
    });
    ctx.tables.core.grantReadData(authorizerFn);

    this.authorizer = new HttpLambdaAuthorizer("StudentAuthorizer", authorizerFn, {
      responseTypes: [HttpLambdaResponseType.SIMPLE],
      identitySource: ["$request.header.Authorization"],
      resultsCacheTtl: cdk.Duration.seconds(60),
    });

    const fn = createPythonFunction(this, "AuthStudentFunction", ctx.defaults, {
      dir: "auth-student",
      description: "Student login and logout",
      timeout: cdk.Duration.seconds(10),
      environment: { CORE_TABLE: ctx.tables.core.tableName, PEPPER_SECRET_ARN: pepper.secretArn },
    });
    ctx.tables.core.grantReadWriteData(fn);
    pepper.grantRead(fn);

    addRoutes(ctx, fn, ["POST /v1/auth/student/login"]);
    addRoutes(ctx, fn, ["POST /v1/auth/student/logout"], this.authorizer);

    // Tighter than the stage default: login is the only route open to guessing.
    const stage = ctx.api.defaultStage?.node.defaultChild as apigwv2.CfnStage;
    stage.addPropertyOverride("RouteSettings.POST /v1/auth/student/login", {
      ThrottlingRateLimit: 5,
      ThrottlingBurstLimit: 10,
    });
  }
}
