
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authenticateRequest } from "@/lib/auth/authenticate";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = auth.role === "admin"
      ? await pool.query(`
      SELECT
        i.incident_id,
        i.title,
        i.description,
        i.location,
        i.priority,
        i.status,
        i.created_at,
        c.category_name,
        d.department_id,
        d.department_name,
        u.full_name AS reported_by
      FROM incidents i
      JOIN categories c ON i.category_id = c.category_id
      JOIN departments d ON c.department_id = d.department_id
      JOIN users u ON i.reported_by = u.user_id
      ORDER BY i.created_at DESC
    `)
      : await pool.query(
          `SELECT
             i.incident_id,
             i.title,
             i.description,
             i.location,
             i.priority,
             i.status,
             i.created_at,
             c.category_name,
             d.department_id,
             d.department_name,
             u.full_name AS reported_by
           FROM incidents i
           JOIN categories c ON i.category_id = c.category_id
           JOIN departments d ON c.department_id = d.department_id
           JOIN users u ON i.reported_by = u.user_id
           WHERE u.auth_account_id = $1
           ORDER BY i.created_at DESC`,
          [auth.userId]
        );

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      incidents: result.rows,
    });
  } catch (error) {
    console.error("Failed to fetch incidents:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch incidents" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request, ["resident"]);
  if (auth instanceof NextResponse) return auth;

  const client = await pool.connect();

  try {
    const body = await request.json();

    const title =
      typeof body.title === "string" ? body.title.trim() : "";
    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : "";
    const location =
      typeof body.location === "string" ? body.location.trim() : "";
    const categoryId = Number(body.category_id);
    const priority =
      typeof body.priority === "string" ? body.priority : "medium";

    if (!title || !description || !location) {
      return NextResponse.json(
        { success: false, message: "Title, description, and location are required." },
        { status: 400 }
      );
    }

    if (title.length > 200 || description.length > 5000 || location.length > 300) {
      return NextResponse.json(
        { success: false, message: "One or more fields exceed the allowed length." },
        { status: 400 }
      );
    }

    if (!Number.isInteger(categoryId) || categoryId < 1) {
      return NextResponse.json(
        { success: false, message: "A valid category is required." },
        { status: 400 }
      );
    }

    if (!["low", "medium", "high", "critical"].includes(priority)) {
      return NextResponse.json(
        { success: false, message: "Invalid priority." },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    const reporter = await client.query(
      "SELECT user_id FROM users WHERE auth_account_id = $1",
      [auth.userId]
    );

    if (reporter.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Your account profile was not found." },
        { status: 403 }
      );
    }

    const reportedBy = reporter.rows[0].user_id as number;
    const result = await client.query(
      `INSERT INTO incidents
         (title, description, category_id, reported_by, location, priority)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING incident_id, title, description, category_id,
                 reported_by, location, priority, status, created_at`,
      [title, description, categoryId, reportedBy, location, priority]
    );

    const incident = result.rows[0];

    await client.query(
      `INSERT INTO status_history
         (incident_id, old_status, new_status, changed_by, remarks)
       VALUES ($1, NULL, 'pending', $2, $3)`,
      [incident.incident_id, reportedBy, "Incident reported"]
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        success: true,
        message: "Incident reported successfully.",
        incident,
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to create incident:", error);

    return NextResponse.json(
      { success: false, message: "Failed to create incident." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
