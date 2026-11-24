// Login gate: shown instead of the app until the fixed operator credential
// (auth.ts) is entered. Follows the app's saved theme (data-theme on <html>).
import { useState, type FormEvent } from "react";
import { signIn } from "./auth";
import "./login.css";

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [keep, setKeep] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (signIn(email, password, keep)) {
      onLogin();
      return;
    }
    setPassword("");
    setError("Email or password is incorrect.");
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <section className="login-left">
          <div className="login-brand">
            <img src="/innotech-logo.png" alt="Innotech Integration" />
            <div>
              <div className="wm">
                <span className="wm-aoi">AOI</span>
                <i /><i /><i /><i />
              </div>
            </div>
            <div className="wm-cap">AUTOMATED OPTICAL INSPECTION</div>
          </div>
          <h1 className="login-title">Welcome back</h1>
          <p className="login-lede">Sign in to the AOI inspection console.</p>
          <form className="login-form" noValidate onSubmit={submit}>
            <div className="login-field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                placeholder="Enter your email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <div className="login-pw">
                <input
                  id="login-password"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="login-eye"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow((s) => !s)}
                >
                  {show ? <Eye /> : <EyeOff />}
                </button>
              </div>
            </div>
            <div className="login-row">
              <label className="login-check">
                <input
                  type="checkbox"
                  checked={keep}
                  onChange={(e) => setKeep(e.target.checked)}
                />
                Keep me signed in
              </label>
            </div>
            <button type="submit" className="login-submit">Sign in</button>
            {error && (
              <p className="login-alert" role="alert">
                {error}
              </p>
            )}
          </form>
          <p className="login-note">
            Access is restricted to authorized operators. Contact your administrator for access.
          </p>
        </section>
        <aside className="login-panel" aria-label="AOI highlights">
          <div className="panel-feed">
            <div className="feed-card">
              <div className="feed-top">
                <span className="rec" />
                LIVE CAMERA
                <span className="tag">Unit 00</span>
              </div>
              <div className="reticle">
                <img src="/bull-head.png" alt="" />
                <i /><i /><i /><i />
              </div>
              <span className="pass-badge">&#10003; PASS</span>
            </div>
          </div>
          <div className="login-panel-body">
            <ul className="login-chips">
              <li>Live inspection</li>
              <li>Defect detection</li>
              <li>Session reports</li>
            </ul>
            <div className="login-quote">
              <p className="login-quote-head">Every unit, inspected and judged in seconds.</p>
              <p className="login-quote-flow">
                Camera feed &rarr; defect detection &rarr; pass/fail &rarr; exportable session report
              </p>
            </div>
            <div className="login-dots">
              <span className="login-dot on" />
              <span className="login-dot" />
              <span className="login-dot" />
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

const Eye = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4" />
    <circle cx="8" cy="8" r="2" />
  </svg>
);
const EyeOff = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 8s2.2-4 6-4c1 0 1.9.3 2.7.7M14 8s-2.2 4-6 4c-1 0-1.9-.3-2.7-.7" />
    <path d="M6.6 6.6a2 2 0 0 0 2.8 2.8" />
    <path d="M2.5 2.5l11 11" />
  </svg>
);
