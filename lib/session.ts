// Centralized client-side session storage. Uses localStorage (not
// sessionStorage) deliberately — sessionStorage clears on tab/window close,
// which was throwing away a perfectly valid 7-day refresh session the
// moment someone closed a tab (common on shared lab machines during a
// test). The refresh token itself lives in an httpOnly cookie either way,
// so nothing more sensitive is being exposed by this switch.
const ACCESS_TOKEN_KEY = "accessToken";
const ROLE_KEY = "role";
const FULL_NAME_KEY = "fullName";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function getAccessToken(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRole(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(ROLE_KEY);
}

export function getFullName(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(FULL_NAME_KEY);
}

export function setSession(accessToken: string, role: string, fullName: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(ROLE_KEY, role);
  localStorage.setItem(FULL_NAME_KEY, fullName);
}

export function setAccessToken(accessToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(FULL_NAME_KEY);
}

// The refresh token is an httpOnly cookie the browser sends automatically
// (credentials: "include") — this silently mints a fresh access token from
// it without the user re-entering anything, as long as the cookie (7 days)
// hasn't expired yet. Returns null on any failure; callers decide whether
// that means "send them to /login".
//
// A page firing several authenticated requests at once when the access
// token has just expired used to trigger one /auth/refresh call per
// request — harmless today (the backend never invalidates the old refresh
// token, so concurrent refreshes all independently succeed), but fragile:
// the moment refresh-token rotation/single-use enforcement is added, the
// "losing" concurrent calls would start causing spurious logouts. Sharing
// one in-flight promise avoids the race entirely regardless of backend
// behavior.
let inFlightRefresh: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return null;
      const data = await res.json();
      setAccessToken(data.accessToken);
      return data.accessToken as string;
    } catch {
      return null;
    } finally {
      inFlightRefresh = null;
    }
  })();

  return inFlightRefresh;
}
