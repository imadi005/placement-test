"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { clearSession, getFullName, getRole } from "@/lib/session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const ROLE_HOME: Record<string, string> = {
  student: "/dashboard",
  coordinator: "/coordinator",
  admin: "/admin",
};

// Screens with their own full-bleed layout (auth, and the live exam itself,
// which deliberately keeps chrome minimal to reduce distraction/exit
// temptation during a timed, proctored test). Critically, the header's own
// "home" link must not appear on /verify-otp or /reset-password — first
// login is a forced, non-skippable sequence, and a nav link back to the app
// would let someone route around it entirely.
const HIDDEN_ON = ["/login", "/verify-otp", "/forgot-password", "/reset-password"];
const HIDDEN_PREFIXES = ["/test/"];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [fullName, setFullName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    setFullName(getFullName());
    setRole(getRole());
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
    clearSession();
    router.push("/login");
  }

  const initials = (fullName ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-outline-variant/70 bg-surface-container-lowest/80 px-4 py-3 backdrop-blur-md md:px-gutter">
      <a
        href={ROLE_HOME[role] ?? "/login"}
        className="font-serif text-body-lg font-bold text-on-surface transition-opacity hover:opacity-80"
      >
        Placement Test Portal
      </a>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 rounded-full border border-outline-variant bg-surface-container-low py-1 pl-1 pr-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-container text-xs font-semibold text-on-primary">
            {initials}
          </span>
          <span className="text-body-sm text-on-surface-variant">
            {fullName} · <span className="capitalize text-on-surface">{role}</span>
          </span>
        </div>
        <Button variant="ghost" size="md" onClick={handleLogout}>
          Log out
        </Button>
      </div>
    </header>
  );
}
