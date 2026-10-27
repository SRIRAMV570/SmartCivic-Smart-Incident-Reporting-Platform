"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type PortalRole = "resident" | "admin";

type PortalGuardProps = {
  role: PortalRole;
  children: ReactNode;
};

type PortalState = {
  pathname: string;
  status: "checking" | "ready" | "error";
  error?: string;
};

export default function PortalGuard({ role, children }: PortalGuardProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [portalState, setPortalState] = useState<PortalState>({
    pathname: "",
    status: "checking",
  });
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const isLoginPage = pathname === `/${role === "admin" ? "admin" : "civic"}/login`;
  const loginPath = role === "admin" ? "/admin/login" : "/civic/login";

  useEffect(() => {
    if (isLoginPage) return;

    let active = true;

    async function verifyPortalAccess() {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await response.json();

        if (!active) return;

        if (!response.ok || !data.success) {
          if (response.status === 401) {
            router.replace(loginPath);
            return;
          }

          setPortalState({
            pathname,
            status: "error",
            error: data.message || "Unable to verify portal access.",
          });
          return;
        }

        if (data.role !== role) {
          router.replace(data.role === "admin" ? "/admin" : "/civic");
          return;
        }

        setPortalState({ pathname, status: "ready" });
      } catch {
        if (active) {
          setPortalState({
            pathname,
            status: "error",
            error: "Unable to verify portal access. Please try again.",
          });
        }
      }
    }

    void verifyPortalAccess();

    return () => {
      active = false;
    };
  }, [isLoginPage, loginPath, pathname, role, router]);

  async function handleSignOut() {
    setSigningOut(true);
    setLogoutError("");

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Unable to sign out.");
      router.replace(loginPath);
      router.refresh();
    } catch (signOutError) {
      setLogoutError(
        signOutError instanceof Error
          ? signOutError.message
          : "Unable to sign out."
      );
      setSigningOut(false);
    }
  }

  if (isLoginPage) return children;

  const currentPortalState =
    portalState.pathname === pathname
      ? portalState
      : { pathname, status: "checking" as const };

  if (currentPortalState.status === "checking") {
    return (
      <main className="grid min-h-screen place-items-center text-slate-600">
        Verifying your account...
      </main>
    );
  }

  if (currentPortalState.status === "error") {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <p className="max-w-lg rounded-lg bg-red-50 p-4 text-red-700" role="alert">
          {currentPortalState.error}
        </p>
      </main>
    );
  }

  return (
    <>
      {role === "admin" && (
        <header className="flex flex-wrap items-center gap-4 border-b bg-white px-6 py-4">
          <strong className="mr-auto text-slate-900">SmartCivic Admin</strong>
          <Link className="text-sm text-slate-700 hover:text-blue-700" href="/admin/incidents">
            Incidents
          </Link>
          <Link className="text-sm text-slate-700 hover:text-blue-700" href="/admin/departments">
            Departments
          </Link>
          <Link className="text-sm text-slate-700 hover:text-blue-700" href="/admin/activity-history">
            Activity history
          </Link>
          <button
            className="rounded-lg border px-3 py-2 text-sm text-slate-700 disabled:opacity-50"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
            type="button"
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
          {logoutError && (
            <p className="w-full text-right text-sm text-red-700" role="alert">
              {logoutError}
            </p>
          )}
        </header>
      )}
      {children}
    </>
  );
}
