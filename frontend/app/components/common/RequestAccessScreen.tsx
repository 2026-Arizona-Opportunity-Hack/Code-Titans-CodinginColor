"use client";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ApiError } from "../../lib/api/client";
import { requestAccess } from "../../lib/api/staff";
import { PublicShell } from "./PublicShell";
const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,189}$/;
/**
 * A teacher outside CIC asks for an account (POST /auth/external/request-access). Nothing is
 * created until a CIC admin approves; the person then gets an invite email. The server gives the
 * same answer whether or not the email already asked, so this screen says the same thing too.
 */
export function RequestAccessScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [organization, setOrganization] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const send = useMutation({
    mutationFn: () => requestAccess({ name: name.trim(), email: email.trim(), organization: organization.trim(), ...(note.trim() ? { note: note.trim() } : {}) }),
    onSuccess: () => setTimeout(() => heading.current?.focus(), 0),
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !organization.trim()) return setProblem("Enter your name and your school.");
    if (!EMAIL.test(email.trim())) return setProblem("Enter a valid email address.");
    setProblem("");
    send.mutate();
  }
  if (send.isSuccess) {
    return (
      <PublicShell>
        <h1 ref={heading} tabIndex={-1} className="text-3xl">Request received</h1>
        <p role="status" className="callout mt-6">
          A CIC admin will review it. If it is approved, an email with your sign-in details will arrive at the address you gave.
        </p>
        <Link href="/" className="btn btn-secondary mt-6">Back to the home page</Link>
      </PublicShell>
    );
  }
  const error = problem || (send.error instanceof ApiError ? send.error.message : send.isError ? "The request could not be sent. Please try again." : "");
  return (
    <PublicShell>
      <h1 className="text-3xl">Request a teacher account</h1>
      <p className="mt-3 text-muted">
        For teachers outside CIC who want to run their own classes on CIC&apos;s curriculum. You manage your own students.
        CIC sees how much your classes are used, and nothing about your students.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-5">
        <div>
          <label htmlFor="ra-name" className="block font-bold">Your name</label>
          <input id="ra-name" className="field mt-1" value={name} maxLength={100} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ra-email" className="block font-bold">Email</label>
          <input id="ra-email" type="email" className="field mt-1" value={email} maxLength={254} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ra-school" className="block font-bold">Your school or organization</label>
          <input id="ra-school" className="field mt-1" value={organization} maxLength={120} autoComplete="organization" onChange={(e) => setOrganization(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ra-note" className="block font-bold">Anything we should know? <span className="font-normal text-muted">(optional)</span></label>
          <textarea id="ra-note" className="field mt-1 min-h-24" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error ? <p role="alert" className="font-bold text-danger">{error}</p> : null}
        <button type="submit" className="btn btn-primary" disabled={send.isPending}>{send.isPending ? "Sending…" : "Send request"}</button>
      </form>
      <p className="mt-6 text-sm text-muted">We use your name and email only to review this request and to send your invite.</p>
      <p className="mt-4"><Link href="/login/" className="font-bold underline">Back to sign in</Link></p>
    </PublicShell>
  );
}
