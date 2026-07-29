"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
export function useAuthGuard(allowedRoles?: string[]) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("accessToken");
    const role = sessionStorage.getItem("role");

    if (!token || !role) {
      router.replace("/login");
      return;
    }
    if (allowedRoles && !allowedRoles.includes(role)) {
      router.replace(ROLE_HOME[role] ?? "/login");
      return;
    }
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready;
}
