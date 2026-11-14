import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { FunctionDefaults } from "../lambda-factory";

export interface RouteThrottle {
  rate: number;
  burst: number;
}

/**
 * Everything a domain construct needs to add its Lambdas and routes.
 *
 * To add a domain: create lib/domains/<name>.ts that takes a DomainContext, builds
 * its Lambda with createPythonFunction, grants table access with the CDK grant
 * methods (least privilege), and calls addRoutes. Then add one line to ApiStack.
 */
export interface DomainContext {
  api: apigwv2.HttpApi;
  defaults: FunctionDefaults;
  tables: {
    content: dynamodb.ITable;
    core: dynamodb.ITable;
    progress: dynamodb.ITable;
    events: dynamodb.ITable;
  };
  /** Cognito JWT authorizer for staff routes. */
  staffAuthorizer: apigwv2.IHttpRouteAuthorizer;
  /** Lambda authorizer for student session tokens. */
  studentAuthorizer: apigwv2.IHttpRouteAuthorizer;
  /** Lambda authorizer for the dashboard's API key. */
  apiKeyAuthorizer: apigwv2.IHttpRouteAuthorizer;
  /** Per-route throttles. addRoutes fills this in and ApiStack applies it to the stage. */
  throttles: Record<string, RouteThrottle>;
}

/**
 * Attach routes to a function. Each route is a route key such as
 * "GET /v1/classes/{classId}/progress". The same strings must appear in the
 * Lambda's routes dict, because the Lambda dispatches on API Gateway's routeKey.
 */
export function addRoutes(
  ctx: DomainContext,
  fn: lambda.IFunction,
  routeKeys: string[],
  authorizer?: apigwv2.IHttpRouteAuthorizer,
  throttle?: RouteThrottle,
): void {
  const integration = new HttpLambdaIntegration(`${fn.node.id}Integration`, fn);
  for (const routeKey of routeKeys) {
    const [method, path] = routeKey.split(" ");
    if (!method || !path || !path.startsWith("/v1/")) {
      throw new Error(`Invalid route key: "${routeKey}". Expected "METHOD /v1/path".`);
    }
    if (throttle) {
      ctx.throttles[routeKey] = throttle;
    }
    ctx.api.addRoutes({
      path,
      methods: [method as apigwv2.HttpMethod],
      integration,
      authorizer,
    });
  }
}
