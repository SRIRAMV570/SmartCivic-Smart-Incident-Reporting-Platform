import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getSessionCookie,
  verifySessionToken,
} from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  let session = null;

  try {
    session = await verifySessionToken(getSessionCookie(request));
  } catch {
    session = null;
  }

  if (request.nextUrl.pathname === "/login") {
    return session
      ? NextResponse.redirect(new URL(session.role === "admin" ? "/incidents" : "/", request.url))
      : NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const adminPath = ["/incidents", "/departments"].some(
    (path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(`${path}/`)
  );

  if (adminPath && session.role !== "admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (request.nextUrl.pathname === "/" && session.role === "admin") {
    return NextResponse.redirect(new URL("/incidents", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/incidents/:path*",
    "/departments/:path*",
    "/activity-history/:path*",
  ],
};
