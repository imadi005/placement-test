"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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
        setError("Invalid roll number/email or password.");
        return;
      }

      const data = await res.json();
      // TODO: move this into a proper auth context/provider once more pages
      // need the token — sessionStorage is a placeholder, not a final choice.
      sessionStorage.setItem("accessToken", data.accessToken);
      router.push("/dashboard");
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
          <h1 className="mt-2 font-serif text-headline-md text-on-surface">Welcome back</h1>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Sign in with your roll number to continue.
          </p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1">
            <span className="text-label-caps text-on-surface-variant">Roll number</span>
            <input
              name="identifier"
              type="text"
              autoComplete="username"
              required
              className="h-11 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md text-on-surface focus:border-primary"
              placeholder="25MCAB58"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-label-caps text-on-surface-variant">Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
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
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>

          <a href="/forgot-password" className="text-center text-body-sm text-on-surface-variant underline underline-offset-2">
            Forgot password?
          </a>
        </form>
      </Card>
    </main>
  );
}
