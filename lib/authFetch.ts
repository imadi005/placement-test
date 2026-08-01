import { clearSession, getAccessToken, refreshAccessToken } from "./session";

// Drop-in replacement for fetch() on authenticated endpoints. Every page used
// to read the token out of storage and attach it by hand, with a 401 just
// failing silently (per the old useAuthGuard comment) — the access token is
// short-lived (15m) and nothing ever refreshed it mid-session, so an idle
// tab would come back to a wall of failed requests that looked like being
// logged out. This attaches the token, and on a 401 tries exactly one
// silent refresh (via the httpOnly refresh cookie) before retrying — only
// falling back to a hard redirect to /login if that refresh also fails.
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const withAuth = (token: string | null): RequestInit => ({
    ...init,
    headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });

  const res = await fetch(input, withAuth(getAccessToken()));
  if (res.status !== 401) return res;

  const refreshed = await refreshAccessToken();
  if (!refreshed) {
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/login";
    return res;
  }

  return fetch(input, withAuth(refreshed));
}
