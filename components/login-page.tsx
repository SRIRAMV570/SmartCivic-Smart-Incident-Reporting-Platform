"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type AuthMode = "login" | "signup";
type LoginPortal = "civic" | "admin";

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedMode, setSelectedMode] = useState<AuthMode>("login");
  const [selectedPortal, setSelectedPortal] = useState<LoginPortal>("civic");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const fixedPortal = pathname === "/admin/login" || pathname === "/civic/login";
  const portal: LoginPortal = fixedPortal
    ? pathname === "/admin/login"
      ? "admin"
      : "civic"
    : selectedPortal;
  const mode: AuthMode =
    fixedPortal && portal === "admin" ? "login" : selectedMode;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");

    const formData = new FormData(event.currentTarget);
    const name = formData.get("name");
    const email = formData.get("email");
    const password = formData.get("password");
    const confirmation = formData.get("confirm-password");

    if (
      mode === "signup" &&
      typeof password === "string" &&
      password !== confirmation
    ) {
      setNotice("The passwords do not match.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(mode === "signup" ? { name } : {}),
          email,
          password,
          portal,
          ...(mode === "signup" ? { confirmPassword: confirmation } : {}),
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to sign in.");
      }

      router.replace(result.role === "admin" ? "/admin" : "/civic");
      router.refresh();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to sign in."
      );
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode: AuthMode) {
    setSelectedMode(nextMode);
    setNotice("");
    setShowPassword(false);
  }

  function changePortal(nextPortal: LoginPortal) {
    setSelectedPortal(nextPortal);
    setSelectedMode("login");
    setNotice("");
    setShowPassword(false);
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-heading">
        <Link className="login-brand" href="/" aria-label="SmartCivic home">
          <span className="brand-icon">S</span>
          <span>
            Smart<span className="brand-light">Civic</span>
          </span>
        </Link>

        <div className="login-content">
          <p className="login-eyebrow">
            {mode === "login"
              ? portal === "admin"
                ? "ADMINISTRATOR PORTAL"
                : "CIVIC PORTAL"
              : "JOIN SMARTCIVIC"}
          </p>
          <h1 id="login-heading">
            {mode === "login"
              ? portal === "admin"
                ? "Administrator sign in"
                : "Civic sign in"
              : "Create your civic account"}
          </h1>
          <p className="login-description">
            {mode === "login"
              ? portal === "admin"
                ? "Manage incoming reports, incidents, officers, and city departments."
                : "Report civic incidents and track progress on the issues you submit."
              : "Create an account to report local issues and follow their progress."}
          </p>

          {!fixedPortal && (
          <div className="auth-tabs" role="tablist" aria-label="Choose login portal">
            <button
              className={`auth-tab${portal === "civic" ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={portal === "civic"}
              onClick={() => changePortal("civic")}
            >
              Civic login
            </button>
            <button
              className={`auth-tab${portal === "admin" ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={portal === "admin"}
              onClick={() => changePortal("admin")}
            >
              Administrator
            </button>
          </div>
          )}

          {portal === "civic" && (
          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button
              id="login-tab"
              className={`auth-tab${mode === "login" ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              aria-controls="auth-form"
              onClick={() => changeMode("login")}
            >
              Sign in
            </button>
            <button
              id="signup-tab"
              className={`auth-tab${mode === "signup" ? " active" : ""}`}
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              aria-controls="auth-form"
              onClick={() => changeMode("signup")}
            >
              Create account
            </button>
          </div>
          )}

          <form
            id="auth-form"
            className="login-form"
            onSubmit={handleSubmit}
            aria-label={`${portal === "admin" ? "Administrator" : "Civic"} ${
              mode === "login" ? "sign in" : "sign up"
            }`}
          >
            {mode === "signup" && (
              <>
                <label htmlFor="signup-name">Full name</label>
                <input
                  id="signup-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  placeholder="Your name"
                  required
                />
              </>
            )}

            <label htmlFor="login-email">Work email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              maxLength={254}
              placeholder="you@organization.com"
              required
            />

            <div className="login-password-label">
              <label htmlFor="login-password">Password</label>
              {mode === "login" && (
                <span>Contact your administrator for help.</span>
              )}
            </div>
            <div className="login-password-input">
              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={8}
                maxLength={72}
                placeholder={
                  mode === "login" ? "Enter your password" : "At least 8 characters"
                }
                required
              />
              <button
                className="password-toggle"
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {mode === "signup" && (
              <>
                <label htmlFor="confirm-password">Confirm password</label>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  placeholder="Re-enter your password"
                  required
                />
              </>
            )}

            <button className="login-submit" type="submit" disabled={busy}>
              {busy
                ? mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
            {notice && (
              <p className="login-notice" role="alert">
                {notice}
              </p>
            )}
          </form>

          <p className="login-back">
            {portal === "admin"
              ? "Admin access is assigned by a system administrator."
              : mode === "login"
                ? "New here? Choose Create account above."
                : <Link href="/civic/login">← Back to civic login</Link>}
          </p>
        </div>

        <p className="login-footer">SMART CIVIC INCIDENT MANAGEMENT</p>
      </section>

      <aside className="login-aside" aria-label="Platform overview">
        <div className="login-aside-content">
          <div className="login-aside-mark" aria-hidden="true">
            ⌖
          </div>
          <p className="login-aside-label">A clearer view of your city</p>
          <h2>Better responses start with better visibility.</h2>
          <p>
            Bring incident reports, teams, and service updates together in one
            place.
          </p>
          <div className="login-aside-status">
            <span className="live-dot" />
            Built for connected communities
          </div>
        </div>
        <span className="login-aside-orbit login-aside-orbit-one" />
        <span className="login-aside-orbit login-aside-orbit-two" />
      </aside>
    </main>
  );
}
