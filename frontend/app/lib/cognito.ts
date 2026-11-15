// Staff sign-in against CIC's Cognito user pool (SRP: the password never leaves the browser).
// Every step returns what the screen should show next. Tokens are kept in sessionStorage,
// so closing the tab signs out, which matters on shared lab machines.
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from "amazon-cognito-identity-js";
import { env } from "../config/env";
import type { StaffRole } from "./api/staff";

export type SignInStep =
  | { step: "done"; idToken: string; role: StaffRole | null }
  | { step: "newPassword" }
  | { step: "setupMfa"; secret: string; otpauthUrl: string }
  | { step: "mfaCode" };

let pool: CognitoUserPool | null = null;
let pending: CognitoUser | null = null; // the user part-way through a sign-in
let pendingEmail = "";

function userPool(): CognitoUserPool {
  if (!pool) {
    pool = new CognitoUserPool({
      UserPoolId: env.userPoolId,
      ClientId: env.userPoolClientId,
      Storage: window.sessionStorage,
    });
  }
  return pool;
}

export function isCognitoConfigured(): boolean {
  return Boolean(env.userPoolId && env.userPoolClientId);
}

const ROLE_PRIORITY: StaffRole[] = ["cic_admin", "instructor", "reviewer"];

/** Read the role from the ID token's groups. Display only: the API checks the role itself. */
export function roleFromToken(idToken: string): StaffRole | null {
  try {
    const payload = JSON.parse(atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    const groups: string[] = payload["cognito:groups"] ?? [];
    return ROLE_PRIORITY.find((r) => groups.includes(r)) ?? null;
  } catch {
    return null;
  }
}

/** Seconds since the epoch when the ID token expires, or 0 if it cannot be read. */
export function tokenExpiry(idToken: string): number {
  try {
    return JSON.parse(atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp ?? 0;
  } catch {
    return 0;
  }
}

function done(session: CognitoUserSession): SignInStep {
  pending = null;
  const idToken = session.getIdToken().getJwtToken();
  return { step: "done", idToken, role: roleFromToken(idToken) };
}

/** Plain-language messages for the errors Cognito returns during sign-in. */
export function signInErrorMessage(error: unknown): string {
  const code = (error as { code?: string; name?: string })?.code ?? (error as { name?: string })?.name;
  switch (code) {
    case "NotAuthorizedException":
      return (error as Error).message?.includes("disabled")
        ? "This account is turned off. Ask a CIC admin to turn it back on."
        : "That email and password don't match. Check them and try again.";
    case "UserNotFoundException":
      return "That email and password don't match. Check them and try again.";
    case "CodeMismatchException":
    case "EnableSoftwareTokenMFAException":
      return "That code didn't work. Enter the 6-digit code your authenticator app shows right now.";
    case "ExpiredCodeException":
      return "That code has expired. Enter the newest code from your app.";
    case "InvalidPasswordException":
      return "Use at least 12 characters with an uppercase letter, a lowercase letter and a number.";
    case "PasswordResetRequiredException":
      return "Your password needs to be reset. Ask a CIC admin to send you a new invite.";
    case "TooManyRequestsException":
    case "LimitExceededException":
      return "Too many tries. Wait a few minutes, then try again.";
    case "NetworkError":
      return "Could not reach the sign-in service. Check your connection and try again.";
    default:
      return "Sign-in didn't work. Please try again.";
  }
}

function callbacks(resolve: (s: SignInStep) => void, reject: (e: unknown) => void) {
  return {
    onSuccess: (session: CognitoUserSession) => resolve(done(session)),
    onFailure: reject,
    newPasswordRequired: () => resolve({ step: "newPassword" }),
    mfaSetup: () => {
      pending!.associateSoftwareToken({
        associateSecretCode: (secret: string) => {
          const label = encodeURIComponent(`Coding in Color:${pendingEmail}`);
          const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent("Coding in Color")}`;
          resolve({ step: "setupMfa", secret, otpauthUrl });
        },
        onFailure: reject,
      });
    },
    totpRequired: () => resolve({ step: "mfaCode" }),
    mfaRequired: () => resolve({ step: "mfaCode" }),
  };
}

export function startSignIn(email: string, password: string): Promise<SignInStep> {
  pendingEmail = email.trim().toLowerCase();
  pending = new CognitoUser({ Username: pendingEmail, Pool: userPool(), Storage: window.sessionStorage });
  const details = new AuthenticationDetails({ Username: pendingEmail, Password: password });
  return new Promise((resolve, reject) => pending!.authenticateUser(details, callbacks(resolve, reject)));
}

/** First sign-in after an invite: replace the temporary password. */
export function setNewPassword(password: string): Promise<SignInStep> {
  return new Promise((resolve, reject) => pending!.completeNewPasswordChallenge(password, {}, callbacks(resolve, reject)));
}

/** Confirm the authenticator app works, then finish signing in. */
export function confirmMfaSetup(code: string): Promise<SignInStep> {
  return new Promise((resolve, reject) =>
    pending!.verifySoftwareToken(code.trim(), "Authenticator app", {
      onSuccess: (session: CognitoUserSession) => resolve(done(session)),
      onFailure: reject,
    }),
  );
}

export function sendMfaCode(code: string): Promise<SignInStep> {
  return new Promise((resolve, reject) => pending!.sendMFACode(code.trim(), callbacks(resolve, reject), "SOFTWARE_TOKEN_MFA"));
}

export function hasPendingSignIn(): boolean {
  return pending !== null;
}

/** A fresh ID token for the signed-in user (Cognito refreshes it when it is close to expiry). */
export function refreshIdToken(): Promise<string | null> {
  if (!isCognitoConfigured()) return Promise.resolve(null);
  const user = userPool().getCurrentUser();
  if (!user) return Promise.resolve(null);
  return new Promise((resolve) =>
    user.getSession((error: Error | null, session: CognitoUserSession | null) => {
      resolve(!error && session?.isValid() ? session.getIdToken().getJwtToken() : null);
    }),
  );
}

export function signOutCognito(): void {
  pending = null;
  if (isCognitoConfigured()) userPool().getCurrentUser()?.signOut();
}
