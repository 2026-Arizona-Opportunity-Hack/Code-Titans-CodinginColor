#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ApiStack } from "../lib/api-stack";
import { AuthStack } from "../lib/auth-stack";
import { applyTags, readConfig } from "../lib/config";
import { DataStack } from "../lib/data-stack";

const app = new cdk.App();
const config = readConfig(app);

// Account and region come from the active AWS profile (use the "hackathon" profile).
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// The shared AWS account already holds other stacks, so every name is prefixed.
const data = new DataStack(app, "CicCurriculumDataStack", { env, allowedOrigins: config.allowedOrigins });
const auth = new AuthStack(app, "CicCurriculumAuthStack", { env, config });
new ApiStack(app, "CicCurriculumApiStack", {
  env,
  config,
  data,
  userPool: auth.userPool,
  userPoolClient: auth.userPoolClient,
});

applyTags(app);
