// Fixed-credential gate for the hosted deployment: one operator account, no
// backend. "Keep me signed in" persists across browser restarts; otherwise
// the sign-in lasts for the tab session only.
const AUTH_KEY = "aoi-auth";
const EMAIL_KEY = "aoi-auth-email";
const FIXED_EMAIL = "digibull@gmail.com";
const FIXED_PASSWORD = "digibull@123";

export function isAuthed(): boolean {
  try {
    return (
      localStorage.getItem(AUTH_KEY) === "1" || sessionStorage.getItem(AUTH_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function signIn(email: string, password: string, keep: boolean): boolean {
  const ok =
    email.trim().toLowerCase() === FIXED_EMAIL && password === FIXED_PASSWORD;
  if (!ok) return false;
  try {
    (keep ? localStorage : sessionStorage).setItem(AUTH_KEY, "1");
    (keep ? localStorage : sessionStorage).setItem(EMAIL_KEY, email.trim().toLowerCase());
  } catch {
    // private mode: the in-memory state still unlocks this session
  }
  return true;
}

/** The email the current session signed in with, for the header avatar. */
export function currentUserEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY) ?? sessionStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function signOut(): void {
  try {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(EMAIL_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
  } catch {
    // ignore
  }
}
