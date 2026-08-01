"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthCard } from "@/components/AuthCard";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function VerifyOtpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const identifier = searchParams.get("identifier") ?? "";
  const masked = searchParams.get("masked");

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!identifier) {
      setError("Missing sign-in details — go back and sign in again.");
      return;
    }

    const otp = String(new FormData(e.currentTarget).get("otp"));
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, otp }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? "That code is invalid or has expired.");
        return;
      }
      const data = await res.json();
      router.push(`/reset-password?token=${encodeURIComponent(data.resetToken)}`);
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Check your inbox"
      subtitle={
        masked
          ? `We sent a 6-digit code to ${masked} — enter it below to continue.`
          : "Enter the 6-digit code we emailed you to continue."
      }
      footer={
        <a
          href="/login"
          className="mt-6 block text-center text-body-sm text-on-surface-variant transition-colors hover:text-primary"
        >
          Didn't get a code? Start over
        </a>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1.5">
          <span className="text-label-caps text-on-surface-variant">6-digit code</span>
          <Input
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            minLength={6}
            maxLength={6}
            pattern="\d{6}"
            placeholder="123456"
            className="text-center text-headline-sm tracking-[0.5em]"
          />
        </label>

        {error && (
          <p role="alert" className="text-body-sm text-error">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
          {isSubmitting ? "Verifying…" : "Verify"}
        </Button>
      </form>
    </AuthCard>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={null}>
      <VerifyOtpForm />
    </Suspense>
  );
}
