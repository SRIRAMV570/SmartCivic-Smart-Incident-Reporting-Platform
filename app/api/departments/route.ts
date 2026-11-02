
import bcrypt from "bcryptjs";
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
           )::int AS resolved_incidents,
         COUNT(DISTINCT officer.user_id)::int AS officer_count,
         MAX(manager.full_name) AS manager_name,
         MAX(manager_account.email) AS manager_email,
         COALESCE(BOOL_OR(manager.auth_account_id IS NOT NULL), false) AS manager_has_login
       FROM departments d
       LEFT JOIN categories c
         ON c.department_id = d.department_id
       LEFT JOIN incidents i
         ON i.category_id = c.category_id
       LEFT JOIN users officer
         ON officer.department_id = d.department_id
        AND officer.role = 'officer'
       LEFT JOIN users manager
         ON manager.department_id = d.department_id
        AND manager.role = 'officer'
        AND manager.is_manager = true
       LEFT JOIN auth_accounts manager_account
         ON manager.auth_account_id = manager_account.account_id
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
      const record = body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : {};
      const name =
        typeof record.department_name === "string"
          ? record.department_name.trim()
          : "";
      const managerName =
        typeof record.manager_name === "string" ? record.manager_name.trim() : "";
      const managerEmail =
        typeof record.manager_email === "string"
          ? record.manager_email.trim().toLowerCase()
          : "";
      const managerPassword =
        typeof record.manager_password === "string"
          ? record.manager_password
          : "";

      if (!name || name.length > 120) {
        return NextResponse.json(
          { success: false, message: "Department name must be 1 to 120 characters." },
          { status: 400 }
        );
      }

      if (managerName.length < 2 || managerName.length > 100) {
        return NextResponse.json(
          { success: false, message: "Manager name must be between 2 and 100 characters." },
          { status: 400 }
        );
      }
      if (
        managerEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail)
      ) {
        return NextResponse.json(
          { success: false, message: "Enter a valid manager email address." },
          { status: 400 }
        );
      }
      if (
        managerPassword.length < 8 ||
        Buffer.byteLength(managerPassword, "utf8") > 72
      ) {
        return NextResponse.json(
          { success: false, message: "Manager password must be at least 8 characters and no more than 72 bytes." },
          { status: 400 }
        );
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `INSERT INTO departments (department_name)
           VALUES ($1)
           RETURNING department_id, department_name`,
          [name]
        );
        const passwordHash = await bcrypt.hash(managerPassword, 12);
        const account = await client.query(
          `INSERT INTO auth_accounts (full_name, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING account_id`,
          [managerName, managerEmail, passwordHash]
        );
        await client.query(
          `INSERT INTO users
             (full_name, department_id, role, auth_account_id, is_manager)
           VALUES ($1, $2, 'officer', $3, true)`,
          [managerName, result.rows[0].department_id, account.rows[0].account_id]
        );
        await client.query("COMMIT");

        return NextResponse.json(
          { success: true, department: result.rows[0] },
          { status: 201 }
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return NextResponse.json(
          { success: false, message: "That department name or manager email is already in use." },
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
