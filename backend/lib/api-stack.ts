import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { AppConfig } from "./config";
import { DataStack } from "./data-stack";
import { DomainContext, addRoutes } from "./domains/context";
import { AdminDomain } from "./domains/admin";
import { ClassesDomain } from "./domains/classes";
import { CurriculumDomain } from "./domains/curriculum";
import { StudentAuthDomain } from "./domains/student-auth";
import { createPythonFunction, hostArchitecture } from "./lambda-factory";

export interface ApiStackProps extends cdk.StackProps {
  config: AppConfig;
  data: DataStack;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
}

/**
 * HTTP API under /v1, the shared Lambda layer, and the Cognito JWT authorizer.
 * Domain Lambdas (reports, student player, read API, ...) are added as one line
 * each in the "Domains" section below.
 */
export class ApiStack extends cdk.Stack {
  public readonly api: apigwv2.HttpApi;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { config, data } = props;

    const layer = new lambda.LayerVersion(this, "SharedLayer", {
      code: lambda.Code.fromAsset(path.join(__dirname, "..", "lambda", "shared-layer"), {
        exclude: ["**/__pycache__", "**/*.pyc"],
      }),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      compatibleArchitectures: [hostArchitecture()],
      description: "Shared CIC helpers: http, errors, authz, db, logging",
    });

    this.api = new apigwv2.HttpApi(this, "Api", {
      apiName: "cic-curriculum-api",
      corsPreflight: {
        allowOrigins: config.allowedOrigins,
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ["Content-Type", "Authorization", "X-Api-Key", "If-Match"],
        maxAge: cdk.Duration.hours(1),
      },
    });

    this.configureStage();

    const staffAuthorizer = new HttpJwtAuthorizer(
      "StaffJwtAuthorizer",
      `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`,
      { jwtAudience: [props.userPoolClient.userPoolClientId] },
    );

    const ctx: DomainContext = {
      api: this.api,
      defaults: { layer, allowedOrigins: config.allowedOrigins },
      tables: {
        content: data.contentTable,
        core: data.coreTable,
        progress: data.progressTable,
        events: data.eventsTable,
      },
      assets: { bucket: data.assetsBucket, cdnDomain: data.assetsCdnDomain },
      userPool: props.userPool,
      staffAuthorizer,
    };

    // Liveness check: public, no data access.
    const health = createPythonFunction(this, "HealthFunction", ctx.defaults, {
      dir: "health",
      description: "GET /v1/health",
      timeout: cdk.Duration.seconds(5),
    });
    addRoutes(ctx, health, ["GET /v1/health"]);

    // ---- Domains: add one line per domain construct here. ----
    new StudentAuthDomain(this, "StudentAuth", ctx);
    new AdminDomain(this, "Admin", ctx);
    new ClassesDomain(this, "Classes", ctx);
    new CurriculumDomain(this, "Curriculum", ctx);

    new cdk.CfnOutput(this, "ApiUrl", { value: this.api.apiEndpoint, description: "HTTP API base URL (append /v1)" });
  }

  /** Default throttling and a PII-free access log (no IP address or user agent). */
  private configureStage(): void {
    const stage = this.api.defaultStage?.node.defaultChild as apigwv2.CfnStage;
    const accessLogs = new logs.LogGroup(this, "AccessLogs", {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    stage.defaultRouteSettings = { throttlingRateLimit: 50, throttlingBurstLimit: 100 };
    stage.accessLogSettings = {
      destinationArn: accessLogs.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        routeKey: "$context.routeKey",
        status: "$context.status",
        latencyMs: "$context.responseLatency",
        integrationError: "$context.integrationErrorMessage",
      }),
    };
  }
}
