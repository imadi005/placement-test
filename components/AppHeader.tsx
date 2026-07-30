"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const ROLE_HOME: Record<string, string> = {
  student: "/dashboard",
  coordinator: "/coordinator",
  admin: "/admin",
};

// Screens with their own full-bleed layout (auth, and the live exam itself,
// which deliberately keeps chrome minimal to reduce distraction/exit
// temptation during a timed, proctored test). Critically, the header's own
// "home" link must not appear on /change-password — that's a forced,
// non-skippable step, and a nav link back to the app would let a user with
// mustChangePassword=true route around it entirely.
const HIDDEN_ON = ["/login", "/change-password", "/forgot-password", "/reset-password"];
const HIDDEN_PREFIXES = ["/test/"];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [fullName, setFullName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setFullName(sessionStorage.getItem("fullName"));
    setRole(sessionStorage.getItem("role"));
  }, [pathname]);

  if (HIDDEN_ON.includes(pathname) || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null;
  }
  if (!role) return null;

  async function handleLogout() {
    try {
      await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // Clearing local session state still logs the user out client-side
      // even if the network call to invalidate the refresh cookie fails.
    }
    sessionStorage.clear();
    router.push("/login");
  }

  return (
    <header className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-4 py-3 md:px-gutter">
      <a href={ROLE_HOME[role] ?? "/login"} className="font-serif text-body-lg font-semibold text-on-surface">
        Placement Test Portal
      </a>
      <div className="flex items-center gap-4">
        <span className="text-body-sm text-on-surface-variant">
          {fullName} · <span className="capitalize">{role}</span>
        </span>
        <Button variant="ghost" size="md" onClick={handleLogout}>
          Log out
        </Button>
      </div>
    </header>
  );
}
