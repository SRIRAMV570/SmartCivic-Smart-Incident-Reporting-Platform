
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authenticateRequest } from "@/lib/auth/authenticate";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await pool.query(
      `SELECT
         u.user_id,
         u.full_name,
         u.department_id,
         d.department_name
       FROM users u
       LEFT JOIN departments d
         ON u.department_id = d.department_id
       WHERE u.role = 'officer'
         AND u.department_id IS NOT NULL
       ORDER BY u.full_name`
    );

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      officers: result.rows,
    });
  } catch (error) {
    console.error("Officers API error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch officers.",
      },
      { status: 500 }
    );
  }
}
