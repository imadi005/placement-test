"use client";

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const identifier = String(new FormData(e.currentTarget).get("identifier"));

    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      if (!res.ok) throw new Error();
      // Always show the same confirmation regardless of whether the
      // identifier matched an account — the backend deliberately doesn't
      // reveal that either.
      setSubmitted(true);
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-label-caps text-primary">Placement Test Portal</p>
          <h1 className="mt-2 font-serif text-headline-md text-on-surface">Reset your password</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Enter your roll number (or email, for staff) and we'll send a reset link.
          </p>
        </div>

        {submitted ? (
          <p className="text-body-md text-on-surface">
            If an account exists for that identifier, a reset link has been sent to its registered
            email. Check your inbox — the link expires in 1 hour.
          </p>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1">
              <span className="text-label-caps text-on-surface-variant">Roll number or email</span>
              <input
                name="identifier"
                type="text"
                autoComplete="username"
                required
                className="h-11 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface focus:border-primary"
                placeholder="25MCAB58"
              />
            </label>

            {error && (
              <p role="alert" className="text-body-sm text-error">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Send reset link"}
            </Button>
          </form>
        )}

        <a
          href="/login"
          className="mt-6 block text-center text-body-sm text-on-surface-variant underline underline-offset-2"
        >
          Back to sign in
        </a>
      </Card>
    </main>
  );
}
