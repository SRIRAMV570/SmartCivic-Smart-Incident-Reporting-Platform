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
       WHERE d.is_active = true
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

export async function POST(request: Request) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "A valid JSON request is required." },
      { status: 400 }
    );
  }

  const values =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const categoryName =
    typeof values.category_name === "string" ? values.category_name.trim() : "";
  const departmentId = Number(values.department_id);

  if (!categoryName || categoryName.length > 120) {
    return NextResponse.json(
      { success: false, message: "Category name must be 1 to 120 characters." },
      { status: 400 }
    );
  }

  if (!Number.isInteger(departmentId) || departmentId < 1) {
    return NextResponse.json(
      { success: false, message: "A valid department is required." },
      { status: 400 }
    );
  }

  try {
    const result = await pool.query(
      `INSERT INTO categories (category_name, department_id)
       SELECT $1, department_id
       FROM departments
       WHERE department_id = $2 AND is_active = true
       RETURNING category_id, category_name, department_id`,
      [categoryName, departmentId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, message: "Active department not found." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, category: result.rows[0] },
      { status: 201 }
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        { success: false, message: "That category name already exists." },
        { status: 409 }
      );
    }

    console.error("Category creation failed:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create incident category." },
      { status: 500 }
    );
  }
}
