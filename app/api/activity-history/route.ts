
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authenticateRequest } from "@/lib/auth/authenticate";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = auth.role === "admin"
      ? await pool.query(
      `SELECT
         sh.history_id,
         sh.incident_id,
         i.title AS incident_title,
         sh.old_status,
         sh.new_status,
         sh.changed_by,
         u.full_name AS changed_by_name,
         sh.remarks,
         sh.changed_at
       FROM status_history sh
       JOIN incidents i
         ON sh.incident_id = i.incident_id
       LEFT JOIN users u
         ON sh.changed_by = u.user_id
       ORDER BY sh.changed_at DESC, sh.history_id DESC`
        )
      : await pool.query(
          `SELECT
             sh.history_id,
             sh.incident_id,
             i.title AS incident_title,
             sh.old_status,
             sh.new_status,
             sh.changed_by,
             u.full_name AS changed_by_name,
             sh.remarks,
             sh.changed_at
           FROM status_history sh
           JOIN incidents i ON sh.incident_id = i.incident_id
           JOIN users reporter ON i.reported_by = reporter.user_id
           LEFT JOIN users u ON sh.changed_by = u.user_id
           WHERE reporter.auth_account_id = $1
           ORDER BY sh.changed_at DESC, sh.history_id DESC`,
          [auth.userId]
        );

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      history: result.rows,
    });
  } catch (error) {
    console.error("Activity History API error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}
