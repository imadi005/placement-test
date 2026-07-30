"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const ROLE_HOME: Record<string, string> = {
  student: "/dashboard",
  coordinator: "/coordinator",
  admin: "/admin",
};

function authHeaders() {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

// Forced first-login screen — landed on straight from login when the
// account's mustChangePassword flag is still set. Already JWT-authenticated
// at this point, so no separate token/identity step is needed here.
export default function ChangePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem("accessToken")) router.replace("/login");
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

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
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ newPassword }),
      });
      if (!res.ok) {
        setError("Couldn't update your password. Try again.");
        return;
      }
      const role = sessionStorage.getItem("role") ?? "";
      router.push(ROLE_HOME[role] ?? "/login");
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
          <h1 className="mt-2 font-serif text-headline-md text-on-surface">Set a new password</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            This is your first time signing in — choose a password only you know before continuing.
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1">
            <span className="text-label-caps text-on-surface-variant">New password</span>
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="h-11 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface focus:border-primary"
              placeholder="••••••••"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-label-caps text-on-surface-variant">Confirm password</span>
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="h-11 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface focus:border-primary"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p role="alert" className="text-body-sm text-error">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="mt-2 w-full" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save and continue"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
