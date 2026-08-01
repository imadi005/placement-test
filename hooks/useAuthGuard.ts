"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken, getRole, refreshAccessToken } from "@/lib/session";

const ROLE_HOME: Record<string, string> = {
  student: "/dashboard",
  coordinator: "/coordinator",
  admin: "/admin",
};

// Every protected page calls this first. Without it, a direct/bookmarked
// visit to e.g. /dashboard with no session just renders a blank page (every
// fetch 401s silently) instead of sending the visitor to log in. Also
// enforces role scoping — a student hitting /admin gets redirected to their
// own home, not a broken page.
//
// If there's no access token in storage — expired-and-gone, or a fresh
// tab/device that never had one this browser session — this doesn't
// immediately bounce to /login. The refresh token is a 7-day httpOnly
// cookie; a silent POST /auth/refresh can very often mint a new access
// token from it with the user never noticing they were ever logged out.
export function useAuthGuard(allowedRoles?: string[]) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      let token = getAccessToken();
      if (!token) {
        token = await refreshAccessToken();
      }
      if (cancelled) return;
      if (!token) {
        router.replace("/login");
        return;
      }

      const role = getRole();
      if (allowedRoles && role && !allowedRoles.includes(role)) {
        router.replace(ROLE_HOME[role] ?? "/login");
        return;
      }
      setReady(true);
    }

    check();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready;
}
