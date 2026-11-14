import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface AppConfig {
  /** Browser origins allowed by CORS: the Amplify URL (once it exists) and http://localhost:3000. */
  allowedOrigins: string[];
  /** Cognito MFA mode for staff. Cognito applies MFA per user pool, not per group. */
  staffMfa: "REQUIRED" | "OPTIONAL";
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
  return { allowedOrigins, staffMfa: mfa };
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
