import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/authenticate";
import pool from "@/lib/db";

export async function GET(request: Request) {
  const session = await authenticateRequest(request);
  if (session instanceof NextResponse) return session;

  try {
    const result = await pool.query(
      `SELECT c.category_id, c.category_name, c.department_id,
              d.department_name
       FROM categories c
       JOIN departments d ON d.department_id = c.department_id
       ORDER BY c.category_name`
    );

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      categories: result.rows,
    });
  } catch (error) {
    console.error("Categories API error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch incident categories." },
      { status: 500 }
    );
  }
}
