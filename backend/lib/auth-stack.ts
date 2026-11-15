import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { AppConfig } from "./config";

export const STAFF_GROUPS = ["cic_admin", "instructor", "external_teacher", "reviewer"] as const;

export interface AuthStackProps extends cdk.StackProps {
  config: AppConfig;
}

/**
 * Cognito for staff only (admins, instructors, external teachers, reviewers). Students never have
 * Cognito accounts; they sign in with a class code and secret words.
 * Managed Login and the OAuth callback URLs are added once the frontend host exists.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const mfaRequired = props.config.staffMfa === "REQUIRED";
    this.userPool = new cognito.UserPool(this, "StaffUserPool", {
      selfSignUpEnabled: false, // invite-only
      signInAliases: { email: true },
      autoVerify: { email: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: mfaRequired ? cognito.Mfa.REQUIRED : cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { otp: true, sms: false }, // TOTP only: SMS would bill through SNS
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    for (const name of STAFF_GROUPS) {
      new cognito.CfnUserPoolGroup(this, `Group-${name}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: name,
        description: `CIC curriculum platform role: ${name}`,
      });
    }

    this.userPoolClient = this.userPool.addClient("WebClient", {
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(7),
    });

    new cdk.CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId, description: "Cognito user pool ID" });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: this.userPoolClient.userPoolClientId, description: "Cognito app client ID" });
  }
}
