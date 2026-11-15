import * as cdk from "aws-cdk-lib";
import { HttpLambdaAuthorizer, HttpLambdaResponseType } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { FunctionDefaults, createPythonFunction } from "../lambda-factory";

/**
 * Lambda authorizer for the CIC dashboard's API key. Simple response, cached for 60 seconds,
 * so a revoked key stops working within a minute. (Student sessions use the authorizer that
 * StudentAuthDomain creates.)
 */
export function createApiKeyAuthorizer(scope: Construct, defaults: FunctionDefaults, core: dynamodb.ITable): HttpLambdaAuthorizer {
  const fn = createPythonFunction(scope, "ApiKeyAuthorizerFunction", defaults, {
    dir: "authorizer-apikey",
    description: "Checks the dashboard API key (hash compare, scopes, revocation)",
    timeout: cdk.Duration.seconds(5),
    environment: { CORE_TABLE: core.tableName },
  });
  core.grantReadWriteData(fn); // reads the key, and records lastUsedAt
  return new HttpLambdaAuthorizer("ApiKeyAuthorizer", fn, {
    responseTypes: [HttpLambdaResponseType.SIMPLE],
    identitySource: ["$request.header.X-Api-Key"],
    resultsCacheTtl: cdk.Duration.seconds(60),
  });
}
