import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface AppConfig {
  /** Browser origins allowed by CORS: the Amplify URL (once it exists) and http://localhost:3000. */
  allowedOrigins: string[];
  /** Cognito MFA mode for staff. Cognito applies MFA per user pool, not per group. */
  staffMfa: "REQUIRED" | "OPTIONAL";
  /** Region where Bedrock is called for student hints. Independent of the stack's region. */
  bedrockRegion: string;
  /** Bedrock foundation model for hints. The IAM policy allows this one model only. */
  hintModelId: string;
  /** Hard monthly cap on hints for the whole app, so the Bedrock bill stays predictable. */
  hintsMonthlyCap: number;
}

/** Read and validate deployment context. Throws if a required value is missing or invalid. */
export function readConfig(scope: Construct): AppConfig {
  const origins = scope.node.tryGetContext("allowedOrigins");
  if (typeof origins !== "string" || origins.trim() === "") {
    throw new Error("Missing required context variable: allowedOrigins (comma-separated origins)");
  }
  const allowedOrigins = origins
    .split(",")
    .map((o: string) => o.trim())
    .filter((o: string) => o.length > 0);
  for (const origin of allowedOrigins) {
    if (origin === "*" || !/^https?:\/\/[^/\s]+$/.test(origin)) {
      throw new Error(`Invalid origin in allowedOrigins: ${origin}. Use full origins without a path, and never "*".`);
    }
  }

  const mfa = String(scope.node.tryGetContext("staffMfa") ?? "REQUIRED").toUpperCase();
  if (mfa !== "REQUIRED" && mfa !== "OPTIONAL") {
    throw new Error(`Invalid staffMfa: ${mfa}. Use REQUIRED or OPTIONAL.`);
  }

  const bedrockRegion = String(scope.node.tryGetContext("bedrockRegion") ?? "us-west-2");
  if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(bedrockRegion)) {
    throw new Error(`Invalid bedrockRegion: ${bedrockRegion}. Use a region name such as us-west-2.`);
  }
  const hintModelId = String(scope.node.tryGetContext("hintModelId") ?? "amazon.nova-lite-v1:0");
  if (!/^[a-z0-9][a-z0-9.:-]{2,100}$/.test(hintModelId) || hintModelId.includes("*")) {
    throw new Error(`Invalid hintModelId: ${hintModelId}. Use one foundation model ID, with no wildcard.`);
  }
  const hintsMonthlyCap = Number(scope.node.tryGetContext("hintsMonthlyCap") ?? 5000);
  if (!Number.isInteger(hintsMonthlyCap) || hintsMonthlyCap < 0 || hintsMonthlyCap > 1_000_000) {
    throw new Error(`Invalid hintsMonthlyCap: ${hintsMonthlyCap}. Use a whole number from 0 to 1000000.`);
  }
  return { allowedOrigins, staffMfa: mfa, bedrockRegion, hintModelId, hintsMonthlyCap };
}

export const PROJECT_TAGS: Record<string, string> = {
  Project: "cic-curriculum",
  Event: "ohack-fall-2026",
};

export function applyTags(scope: Construct): void {
  for (const [key, value] of Object.entries(PROJECT_TAGS)) {
    cdk.Tags.of(scope).add(key, value);
  }
}
