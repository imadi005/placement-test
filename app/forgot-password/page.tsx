"use client";

import { useState, FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthCard } from "@/components/AuthCard";

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
    <AuthCard
      title="Reset your password"
      subtitle="Enter your roll number (or email, for staff) and we'll send a reset link."
      footer={
        <a
          href="/login"
          className="mt-6 block text-center text-body-sm text-on-surface-variant transition-colors hover:text-primary"
        >
          Back to sign in
        </a>
      }
    >
      {submitted ? (
        <p className="animate-fade-in text-body-md text-on-surface">
          If an account exists for that identifier, a reset link has been sent to its registered
          email. Check your inbox — the link expires in 1 hour.
        </p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5">
            <span className="text-label-caps text-on-surface-variant">Roll number or email</span>
            <Input name="identifier" type="text" autoComplete="username" required placeholder="25MCAB58" />
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
    </AuthCard>
  );
}
