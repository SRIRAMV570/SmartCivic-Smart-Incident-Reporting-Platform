import { NextResponse } from "next/server";
import pool from "@/lib/db";
import {
  getSessionCookie,
  verifySessionToken,
  type UserRole,
} from "@/lib/auth/session";

export async function authenticateRequest(
  request: Request,
  allowedRoles?: UserRole[]
) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    return NextResponse.json(
      { success: false, message: "Authentication is not configured." },
      { status: 503 }
    );
  }

  try {
    const session = await verifySessionToken(getSessionCookie(request));

    if (!session) {
      return NextResponse.json(
        { success: false, message: "Authentication required." },
        { status: 401 }
      );
    }

    const account = await pool.query(
      `SELECT role
       FROM users
       WHERE auth_account_id = $1`,
      [session.userId]
    );

    if (
      account.rowCount === 0 ||
      account.rows[0].role !== session.role
    ) {
      return NextResponse.json(
        { success: false, message: "Your session is no longer valid. Please sign in again." },
        { status: 401 }
      );
    }

    if (allowedRoles && !allowedRoles.includes(session.role)) {
      return NextResponse.json(
        { success: false, message: "You are not authorized to perform this action." },
        { status: 403 }
      );
    }

    return session;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      error.digest === "NEXT_PRERENDER_INTERRUPTED"
    ) {
      throw error;
    }

    console.error("Session verification failed:", error);
    return NextResponse.json(
      { success: false, message: "Unable to verify session." },
      { status: 500 }
    );
  }
}
