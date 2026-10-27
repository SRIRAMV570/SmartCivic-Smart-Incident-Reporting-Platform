
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authenticateRequest } from "@/lib/auth/authenticate";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await pool.query(
      `SELECT
         d.department_id,
         d.department_name,
         COUNT(DISTINCT i.incident_id)::int AS total_incidents,
         COUNT(DISTINCT i.incident_id)
           FILTER (
             WHERE i.status NOT IN ('resolved', 'rejected')
           )::int AS open_incidents,
         COUNT(DISTINCT i.incident_id)
           FILTER (
             WHERE i.status = 'resolved'
           )::int AS resolved_incidents
       FROM departments d
       LEFT JOIN categories c
         ON c.department_id = d.department_id
       LEFT JOIN incidents i
         ON i.category_id = c.category_id
       GROUP BY
         d.department_id,
         d.department_name
       ORDER BY d.department_id`
    );

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      departments: result.rows,
    });
  } catch (error) {
    console.error("Departments API error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch departments.",
      },
      { status: 500 }
    );
  }

}

export async function POST(request: Request) {
    const auth = await authenticateRequest(request, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    try {
      const body: unknown = await request.json();
      const name =
        body && typeof body === "object" && "department_name" in body &&
        typeof body.department_name === "string"
          ? body.department_name.trim()
          : "";

      if (!name || name.length > 120) {
        return NextResponse.json(
          { success: false, message: "Department name must be 1 to 120 characters." },
          { status: 400 }
        );
      }

      const result = await pool.query(
        `INSERT INTO departments (department_name)
         VALUES ($1)
         RETURNING department_id, department_name`,
        [name]
      );

      return NextResponse.json(
        { success: true, department: result.rows[0] },
        { status: 201 }
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return NextResponse.json(
          { success: false, message: "That department already exists." },
          { status: 409 }
        );
      }

      console.error("Department creation failed:", error);
      return NextResponse.json(
        { success: false, message: "Failed to create department." },
        { status: 500 }
      );
    }
  }

export async function PATCH(request: Request) {
    const auth = await authenticateRequest(request, ["admin"]);
    if (auth instanceof NextResponse) return auth;

    try {
      const body: unknown = await request.json();
      const record = body && typeof body === "object"
        ? body as Record<string, unknown>
        : {};
      const departmentId = Number(record.department_id);
      const name =
        typeof record.department_name === "string"
          ? record.department_name.trim()
          : "";

      if (!Number.isInteger(departmentId) || departmentId < 1 ||
          !name || name.length > 120) {
        return NextResponse.json(
          { success: false, message: "A valid department ID and name are required." },
          { status: 400 }
        );
      }

      const result = await pool.query(
        `UPDATE departments
         SET department_name = $1
         WHERE department_id = $2
         RETURNING department_id, department_name`,
        [name, departmentId]
      );

      if (result.rowCount === 0) {
        return NextResponse.json(
          { success: false, message: "Department not found." },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, department: result.rows[0] });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return NextResponse.json(
          { success: false, message: "That department name is already in use." },
          { status: 409 }
        );
      }

      console.error("Department update failed:", error);
      return NextResponse.json(
        { success: false, message: "Failed to update department." },
        { status: 500 }
      );
  }
}
