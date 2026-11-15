"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  SignInStep,
  confirmMfaSetup,
  sendMfaCode,
  setNewPassword,
  signInErrorMessage,
  startSignIn,
} from "../../lib/cognito";
import type { StaffRole } from "../../lib/api/staff";

type Props = { onSignedIn: (idToken: string, role: StaffRole | null) => void };
type Step = "credentials" | "newPassword" | "setupMfa" | "mfaCode";

const inputClass = "field mt-1";
const HEADINGS: Record<Step, string> = {
  credentials: "Sign in with your CIC account",
  newPassword: "Choose a new password",
  setupMfa: "Set up your authenticator app",
  mfaCode: "Enter your sign-in code",
};

/** Email and password, then whatever Cognito asks for next: a new password, MFA setup or an MFA code. */
export function StaffSignInForm({ onSignedIn }: Props) {
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPasswordValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  // Move focus to the new heading on each step, so keyboard and screen-reader users know the screen changed.
  useEffect(() => {
    if (step !== "credentials") heading.current?.focus();
  }, [step]);

  function apply(next: SignInStep) {
    setError("");
    setCode("");
    if (next.step === "done") {
      onSignedIn(next.idToken, next.role);
    } else if (next.step === "setupMfa") {
      setSecret(next.secret);
      setOtpauthUrl(next.otpauthUrl);
      setStep("setupMfa");
    } else {
      setStep(next.step);
    }
  }

  async function run(action: () => Promise<SignInStep>) {
    setBusy(true);
    try {
      apply(await action());
    } catch (e) {
      setError(signInErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (step === "credentials") {
      if (!email.trim() || !password) return setError("Enter your email and password.");
      run(() => startSignIn(email, password));
    } else if (step === "newPassword") {
      if (newPassword !== confirm) return setError("The two passwords don't match.");
      run(() => setNewPassword(newPassword));
    } else {
      if (!/^\d{6}$/.test(code.trim())) return setError("Enter the 6-digit code from your authenticator app.");
      run(() => (step === "setupMfa" ? confirmMfaSetup(code) : sendMfaCode(code)));
    }
  }

  const codeField = (
    <div>
      <label htmlFor="mfaCode" className="block font-bold">
        6-digit code
      </label>
      <input
        id="mfaCode"
        name="mfaCode"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className={`${inputClass} font-mono`}
      />
    </div>
  );

  return (
    <section aria-labelledby="signin-heading" className="mt-6">
      <h2 id="signin-heading" ref={heading} tabIndex={-1} className="text-xl">
        {HEADINGS[step]}
      </h2>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-6">
        {step === "credentials" ? (
          <>
            <div>
              <label htmlFor="email" className="block font-bold">
                Email
              </label>
              <input id="email" name="email" type="email" autoComplete="username" value={email}
                onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="password" className="block font-bold">
                Password
              </label>
              <input id="password" name="password" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            </div>
          </>
        ) : null}

        {step === "newPassword" ? (
          <>
            <p className="text-muted">
              This is your first sign-in. Replace the temporary password from your invite email.
            </p>
            <div>
              <label htmlFor="newPassword" className="block font-bold">
                New password
              </label>
              <p id="newPassword-hint" className="text-sm text-muted">
                At least 12 characters, with an uppercase letter, a lowercase letter and a number.
              </p>
              <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" value={newPassword}
                onChange={(e) => setNewPasswordValue(e.target.value)} aria-describedby="newPassword-hint" className={inputClass} />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block font-bold">
                Type it again
              </label>
              <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
            </div>
          </>
        ) : null}

        {step === "setupMfa" ? (
          <>
            <ol className="list-decimal space-y-2 pl-6">
              <li>Open an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator.</li>
              <li>
                Add an account and choose to enter a setup key. Use this key:
                <code className="mt-2 block break-all rounded bg-tint p-3 font-mono text-lg">{secret}</code>
                On a phone you can <a href={otpauthUrl} className="underline">open the key in your authenticator app</a>.
              </li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            {codeField}
          </>
        ) : null}

        {step === "mfaCode" ? (
          <>
            <p className="text-muted">Open your authenticator app and enter the code for Coding in Color.</p>
            {codeField}
          </>
        ) : null}

        {error ? (
          <p role="alert" className="callout callout-danger font-bold text-danger">
            {error}
          </p>
        ) : null}
        <div>
          <button type="submit" className="btn btn-primary w-full sm:w-auto" disabled={busy} aria-disabled={busy}>
            {busy ? "Signing in…" : step === "credentials" ? "Sign in" : "Continue"}
          </button>
        </div>
      </form>
    </section>
  );
}
