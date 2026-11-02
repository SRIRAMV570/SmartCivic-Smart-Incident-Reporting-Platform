import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/authenticate";
import pool from "@/lib/db";

export async function GET(request: Request) {
  const session = await authenticateRequest(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await pool.query(
      `SELECT account.account_id, account.full_name, account.email,
              app_user.department_id, department.department_name,
              COALESCE(app_user.is_manager, false) AS is_manager
       FROM auth_accounts account
       JOIN users app_user ON app_user.auth_account_id = account.account_id
       LEFT JOIN departments department
         ON app_user.department_id = department.department_id
       WHERE account.account_id = $1`,
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
