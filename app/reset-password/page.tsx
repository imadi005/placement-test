"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthCard } from "@/components/AuthCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("This reset link is missing its token — request a new one.");
      return;
    }

    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("newPassword"));
    const confirmPassword = String(form.get("confirmPassword"));

    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "This reset link is invalid or has expired.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <p className="animate-fade-in text-body-md text-on-surface">
          Password updated — taking you to sign in…
        </p>
      ) : !token ? (
        <p className="text-body-md text-error">
          This link is missing its token.{" "}
          <a href="/forgot-password" className="underline underline-offset-2">
            Request a new one
          </a>
          .
        </p>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5">
            <span className="text-label-caps text-on-surface-variant">New password</span>
            <Input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="••••••••"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-label-caps text-on-surface-variant">Confirm password</span>
            <Input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p role="alert" className="text-body-sm text-error">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Reset password"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
