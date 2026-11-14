import * as cdk from "aws-cdk-lib";
import { HttpLambdaAuthorizer, HttpLambdaResponseType } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { FunctionDefaults, createPythonFunction } from "../lambda-factory";

/**
 * Lambda authorizers for the two non-Cognito callers: students (session token) and the
 * CIC dashboard (API key). Both use simple responses and cache for 60 seconds, so a
 * revoked session or key stops working within a minute.
 */
export function createStudentAuthorizer(scope: Construct, defaults: FunctionDefaults, core: dynamodb.ITable): HttpLambdaAuthorizer {
  const fn = createPythonFunction(scope, "StudentAuthorizerFunction", defaults, {
    dir: "authorizer-student",
    description: "Resolves a student session token to studentId and classId",
    timeout: cdk.Duration.seconds(5),
    environment: { CORE_TABLE: core.tableName },
  });
  core.grantReadData(fn);
  return new HttpLambdaAuthorizer("StudentAuthorizer", fn, {
    responseTypes: [HttpLambdaResponseType.SIMPLE],
    identitySource: ["$request.header.Authorization"],
    resultsCacheTtl: cdk.Duration.seconds(60),
  });
}

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
