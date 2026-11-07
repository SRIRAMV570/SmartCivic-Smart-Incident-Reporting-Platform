import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "smartcivic_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

export type UserRole = "resident" | "officer" | "admin";

export type SessionIdentity = {
  userId: string;
  role: UserRole;
};

function getSessionKey() {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters.");
  }

  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string, role: UserRole) {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSessionKey());
}

export async function verifySessionToken(
  token: string | undefined
): Promise<SessionIdentity | null> {
  if (!token) return null;

  const key = getSessionKey();

  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    });

    if (
      typeof payload.sub !== "string" ||
      !["resident", "officer", "admin"].includes(String(payload.role))
    ) {
      return null;
    }

    return {
      userId: payload.sub,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export function getSessionCookie(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;

  const prefix = `${SESSION_COOKIE}=`;
  const sessionCookie = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix));

  return sessionCookie?.slice(prefix.length);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };
}
