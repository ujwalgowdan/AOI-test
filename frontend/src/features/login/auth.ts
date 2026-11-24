// Fixed-credential gate for the hosted deployment: one operator account, no
// backend. "Keep me signed in" persists across browser restarts; otherwise
// the sign-in lasts for the tab session only.
const AUTH_KEY = "aoi-auth";
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
  } catch {
    // private mode: the in-memory state still unlocks this session
  }
  return true;
}

export function signOut(): void {
  try {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
  } catch {
    // ignore
  }
}
