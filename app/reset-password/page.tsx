"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Spinner } from "@/components/ui/Spinner";
import { AuthCard } from "@/components/AuthCard";
import { PasswordStrengthMeter, passwordMeetsRules } from "@/components/auth/PasswordStrengthMeter";
import { setSession } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const ROLE_HOME: Record<string, string> = {
  student: "/dashboard",
  coordinator: "/coordinator",
  admin: "/admin",
};

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("This reset link is missing its token — request a new one.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!passwordMeetsRules(newPassword)) {
      setError("Password doesn't meet all the requirements below yet.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // stores the httpOnly refresh cookie for the auto-login below
        body: JSON.stringify({ token, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "This reset link is invalid or has expired.");
        setIsSubmitting(false);
        return;
      }
      const data = await res.json();
      // Just proved ownership of this account (OTP or emailed link) and set
      // a real password — no reason to make them type credentials again.
      // Not resetting isSubmitting here — stays disabled/spinning through
      // the navigation into the dashboard instead of flashing back to
      // "Reset password" right as the next page is still loading.
      setSession(data.accessToken, data.user.role, data.user.fullName);
      router.push(ROLE_HOME[data.user.role] ?? "/login");
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard title="Choose a new password">
      {!token ? (
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
            <PasswordInput
              name="newPassword"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          <PasswordStrengthMeter password={newPassword} />

          <label className="flex flex-col gap-1.5">
            <span className="text-label-caps text-on-surface-variant">Confirm password</span>
            <PasswordInput
              name="confirmPassword"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p role="alert" className="text-body-sm text-error">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="mt-2 w-full gap-2" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
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
