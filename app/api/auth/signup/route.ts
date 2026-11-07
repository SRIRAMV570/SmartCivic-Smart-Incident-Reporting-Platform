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
      { success: false, message: "Invalid signup details." },
      { status: 400 }
    );
  }

  const values = body as Record<string, unknown>;
  const name = typeof values.name === "string" ? values.name.trim() : "";
  const email =
    typeof values.email === "string" ? values.email.trim().toLowerCase() : "";
  const password =
    typeof values.password === "string" ? values.password : "";
  const confirmPassword =
    typeof values.confirmPassword === "string" ? values.confirmPassword : "";

  if (name.length < 2 || name.length > 100) {
    return NextResponse.json(
      { success: false, message: "Name must be between 2 and 100 characters." },
      { status: 400 }
    );
  }

  if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return NextResponse.json(
      { success: false, message: "Enter a valid email address." },
      { status: 400 }
    );
  }

  if (
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return NextResponse.json(
      {
        success: false,
        message: "Password must be at least 8 characters and no more than 72 bytes.",
      },
      { status: 400 }
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json(
      { success: false, message: "The passwords do not match." },
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
    const passwordHash = await bcrypt.hash(password, 12);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const result = await client.query(
        `INSERT INTO auth_accounts (full_name, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING account_id, full_name, email`,
        [name, email, passwordHash]
      );
      const account = result.rows[0] as {
        account_id: string | number;
        full_name: string;
        email: string;
      };

      await client.query(
        `INSERT INTO users (full_name, auth_account_id)
         VALUES ($1, $2)`,
        [account.full_name, account.account_id]
      );

      await client.query("COMMIT");

      const session = await createSessionToken(
        String(account.account_id),
        "resident"
      );
      const response = NextResponse.json({
        success: true,
        role: "resident",
        account: {
          id: String(account.account_id),
          name: account.full_name,
          email: account.email,
        },
      });

      response.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { success: false, message: "An account with this email already exists." },
        { status: 409 }
      );
    }

    console.error("Signup failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to create your account." },
      { status: 500 }
    );
  }
}
