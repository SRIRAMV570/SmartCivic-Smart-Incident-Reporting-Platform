import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "A valid JSON request is required." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { success: false, message: "Invalid login details." },
      { status: 400 }
    );
  }

  const values = body as Record<string, unknown>;
  const email =
    typeof values.email === "string" ? values.email.trim().toLowerCase() : "";
  const password =
    typeof values.password === "string" ? values.password : "";
  const portal = values.portal === "admin" ? "admin" : "civic";

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return NextResponse.json(
      { success: false, message: "Enter a valid email and password." },
      { status: 400 }
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { success: false, message: "DATABASE_URL is not configured." },
      { status: 503 }
    );
  }

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    return NextResponse.json(
      {
        success: false,
        message: "SESSION_SECRET must be set to at least 32 characters.",
      },
      { status: 503 }
    );
  }

  try {
    const result = await pool.query(
      `SELECT account.account_id, account.full_name, account.email,
              account.password_hash, app_user.role
       FROM auth_accounts account
       JOIN users app_user ON app_user.auth_account_id = account.account_id
       WHERE account.email = $1`,
      [email]
    );
    const account = result.rows[0] as
      | {
          account_id: string | number;
          full_name: string;
          email: string;
          password_hash: string;
          role: "resident" | "officer" | "admin";
        }
      | undefined;

    if (!account || !(await bcrypt.compare(password, account.password_hash))) {
      return NextResponse.json(
        { success: false, message: "Invalid email or password." },
        { status: 401 }
      );
    }

    const expectedRole = portal === "admin" ? "admin" : "resident";
    if (account.role !== expectedRole) {
      return NextResponse.json(
        {
          success: false,
          message:
            portal === "admin"
              ? "This account does not have administrator access."
              : "This account is not registered as a civic user.",
        },
        { status: 403 }
      );
    }

    const session = await createSessionToken(
      String(account.account_id),
      account.role
    );
    const response = NextResponse.json({
      success: true,
      role: account.role,
      account: {
        id: String(account.account_id),
        name: account.full_name,
        email: account.email,
      },
    });

    response.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Login failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to sign in." },
      { status: 500 }
    );
  }
}
