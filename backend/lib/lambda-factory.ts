import * as os from "os";
import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";

export interface PythonFunctionProps {
  /** Directory name under backend/lambda (kebab-case), for example "reports-api". */
  dir: string;
  /** Resource names for the function, passed through the environment (never ARNs). */
  environment?: Record<string, string>;
  timeout?: cdk.Duration;
  memorySize?: number;
  description?: string;
}

export interface FunctionDefaults {
  layer: lambda.ILayerVersion;
  allowedOrigins: string[];
}

/** Lambda architecture that matches the build machine (arm64 on Apple silicon). */
export function hostArchitecture(): lambda.Architecture {
  return os.arch() === "arm64" ? lambda.Architecture.ARM_64 : lambda.Architecture.X86_64;
}

/**
 * Create a Python 3.12 Lambda following the CIC backend standards: index.lambda_handler,
 * explicit timeout, host-matched architecture, shared layer, and a log group with
 * 14-day retention so logs cannot grow unbounded.
 */
export function createPythonFunction(
  scope: Construct,
  id: string,
  defaults: FunctionDefaults,
  props: PythonFunctionProps,
): lambda.Function {
  const logGroup = new logs.LogGroup(scope, `${id}Logs`, {
    retention: logs.RetentionDays.TWO_WEEKS,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  return new lambda.Function(scope, id, {
    runtime: lambda.Runtime.PYTHON_3_12,
    handler: "index.lambda_handler",
    code: lambda.Code.fromAsset(path.join(__dirname, "..", "lambda", props.dir), {
      exclude: ["__pycache__", "*.pyc", "requirements.txt", "tests"],
    }),
    architecture: hostArchitecture(),
    timeout: props.timeout ?? cdk.Duration.seconds(15),
    memorySize: props.memorySize ?? 256,
    description: props.description,
    layers: [defaults.layer],
    logGroup,
    environment: {
      ALLOWED_ORIGINS: defaults.allowedOrigins.join(","),
      ...props.environment,
    },
  });
}
