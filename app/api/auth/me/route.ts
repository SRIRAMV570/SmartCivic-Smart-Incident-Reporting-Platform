import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/authenticate";
import pool from "@/lib/db";

export async function GET(request: Request) {
  const session = await authenticateRequest(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await pool.query(
      `SELECT account_id, full_name, email
       FROM auth_accounts
       WHERE account_id = $1`,
      [session.userId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, message: "Account not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      role: session.role,
      account: result.rows[0],
    });
  } catch (error) {
    console.error("Failed to load current account:", error);
    return NextResponse.json(
      { success: false, message: "Unable to load account details." },
      { status: 500 }
    );
  }
}
