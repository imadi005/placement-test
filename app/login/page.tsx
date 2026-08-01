"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthCard } from "@/components/AuthCard";
import { setSession } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(e.currentTarget);
    const identifier = String(form.get("identifier"));
    const password = String(form.get("password"));

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // needed so the httpOnly refresh cookie is stored
        body: JSON.stringify({ identifier, password }),
      });

      if (!res.ok) {
        setError("Invalid user ID or password.");
        return;
      }

      const data = await res.json();

      // First login (or any account still on a temp password) never gets a
      // session here — it gets an emailed OTP instead, and only reaches the
      // app after that's verified and a real password is set.
      if (data.otpRequired) {
        router.push(`/verify-otp?identifier=${encodeURIComponent(identifier)}&masked=${encodeURIComponent(data.maskedEmail)}`);
        return;
      }

      setSession(data.accessToken, data.user.role, data.user.fullName);

      const roleRoutes: Record<string, string> = {
        student: "/dashboard",
        coordinator: "/coordinator",
        admin: "/admin",
      };
      router.push(roleRoutes[data.user.role] ?? "/dashboard");
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in with your user ID to continue."
      footer={
        <a
          href="/forgot-password"
          className="mt-6 block text-center text-body-sm text-on-surface-variant transition-colors hover:text-primary"
        >
          Forgot password?
        </a>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1.5">
          <span className="text-label-caps text-on-surface-variant">User ID</span>
          <Input
            name="identifier"
            type="text"
            autoComplete="username"
            required
            placeholder="25MCAB58 or you@kristujayanti.com"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-label-caps text-on-surface-variant">Password</span>
          <Input name="password" type="password" autoComplete="current-password" required placeholder="••••••••" />
        </label>

        {error && (
          <p role="alert" className="text-body-sm text-error">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthCard>
  );
}
