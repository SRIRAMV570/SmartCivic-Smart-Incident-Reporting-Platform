
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authenticateRequest } from "@/lib/auth/authenticate";
import { syncIncidentVector } from "@/lib/incident-vector-sync";
import { deleteIncidentVector } from "@/lib/qdrant";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const searchTerm = new URL(request.url).searchParams.get("search")?.trim() ?? "";
    const searchFilter = `($1::text = '' OR i.search_vector @@ websearch_to_tsquery('english', $1))`;
    const result = auth.role === "admin"
      ? await pool.query(`
      SELECT
        i.incident_id,
        i.category_id,
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
      WHERE i.status <> 'resolved'
        AND ${searchFilter}
      ORDER BY
        CASE i.priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END,
        i.created_at DESC
    `, [searchTerm])
      : auth.role === "officer"
        ? await pool.query(
          `SELECT
             i.incident_id,
             i.category_id,
             i.title,
             i.description,
             i.location,
             i.priority,
             i.status,
             i.created_at,
             c.category_name,
             d.department_id,
             d.department_name,
             reporter.full_name AS reported_by
           FROM incidents i
           JOIN categories c ON i.category_id = c.category_id
           JOIN departments d ON c.department_id = d.department_id
           JOIN users reporter ON i.reported_by = reporter.user_id
           JOIN users officer ON officer.auth_account_id = $1
           WHERE d.department_id = officer.department_id
             AND i.status <> 'resolved'
             AND ($2::text = '' OR i.search_vector @@ websearch_to_tsquery('english', $2))
             AND (
               officer.is_manager = true
               OR EXISTS (
                 SELECT 1
                 FROM assignments assignment
                 WHERE assignment.incident_id = i.incident_id
                   AND assignment.officer_id = officer.user_id
               )
             )
           ORDER BY
             CASE i.priority
               WHEN 'critical' THEN 1
               WHEN 'high' THEN 2
               WHEN 'medium' THEN 3
               WHEN 'low' THEN 4
               ELSE 5
             END,
             i.created_at DESC`,
          [auth.userId, searchTerm]
        )
      : await pool.query(
          `SELECT
             i.incident_id,
             i.category_id,
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
           WHERE u.auth_account_id = $2
             AND i.status <> 'resolved'
             AND ${searchFilter}
           ORDER BY i.created_at DESC`,
          [searchTerm, auth.userId]
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
    const body: unknown = await request.json();
    const values =
      body && typeof body === "object" ? (body as Record<string, unknown>) : {};

    const title =
      typeof values.title === "string" ? values.title.trim() : "";
    const description =
      typeof values.description === "string"
        ? values.description.trim()
        : "";
    const location =
      typeof values.location === "string" ? values.location.trim() : "";
    const categoryId = Number(values.category_id);
    const priority =
      typeof values.priority === "string" ? values.priority : "medium";

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

    const category = await client.query(
      `SELECT c.category_id
       FROM categories c
       JOIN departments d ON d.department_id = c.department_id
       WHERE c.category_id = $1 AND d.is_active = true`,
      [categoryId]
    );
    if (category.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Choose an active incident category." },
        { status: 400 }
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
    await client.query(
      "INSERT INTO incident_vector_sync (incident_id) VALUES ($1)",
      [incident.incident_id]
    );

    await client.query("COMMIT");
    let vectorIndexed = true;
    try {
      await syncIncidentVector(incident);
    } catch (error) {
      vectorIndexed = false;
      console.error("Incident saved; vector indexing is pending:", error);
    }

    return NextResponse.json(
      {
        success: true,
        message: vectorIndexed
          ? "Incident reported successfully."
          : "Incident reported. Similarity indexing will retry when Qdrant is available.",
        vector_indexed: vectorIndexed,
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

export async function PATCH(request: Request) {
  const auth = await authenticateRequest(request, ["resident"]);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const values =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const incidentId = Number(values.incident_id);
  const title = typeof values.title === "string" ? values.title.trim() : "";
  const description =
    typeof values.description === "string" ? values.description.trim() : "";
  const location = typeof values.location === "string" ? values.location.trim() : "";
  const categoryId = Number(values.category_id);
  const priority = typeof values.priority === "string" ? values.priority : "";

  if (!Number.isInteger(incidentId) || incidentId < 1) {
    return NextResponse.json(
      { success: false, message: "A valid incident ID is required." },
      { status: 400 }
    );
  }
  if (
    !title ||
    title.length > 200 ||
    !description ||
    description.length > 5000 ||
    !location ||
    location.length > 300
  ) {
    return NextResponse.json(
      { success: false, message: "Enter a title, description, and location within the allowed lengths." },
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ownership = await client.query(
      `SELECT i.incident_id, i.status, i.reported_by
       FROM incidents i
       JOIN users u ON u.user_id = i.reported_by
       WHERE i.incident_id = $1
         AND u.auth_account_id = $2
       FOR UPDATE OF i`,
      [incidentId, auth.userId]
    );
    if (ownership.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Incident not found." },
        { status: 404 }
      );
    }
    if (!["pending", "assigned"].includes(ownership.rows[0].status)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          message: "Reports can only be edited before work has started.",
        },
        { status: 409 }
      );
    }

    const category = await client.query(
      `SELECT c.category_id
       FROM categories c
       JOIN departments d ON d.department_id = c.department_id
       WHERE c.category_id = $1 AND d.is_active = true`,
      [categoryId]
    );
    if (category.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Choose an active incident category." },
        { status: 400 }
      );
    }

    const previousStatus = ownership.rows[0].status as string;
    await client.query(
      "DELETE FROM assignments WHERE incident_id = $1",
      [incidentId]
    );
    const result = await client.query(
      `UPDATE incidents
       SET title = $1,
           description = $2,
           category_id = $3,
           location = $4,
           priority = $5,
           status = 'pending',
           updated_at = CURRENT_TIMESTAMP
       WHERE incident_id = $6
       RETURNING incident_id, title, description, category_id,
                 location, priority, status, created_at, updated_at`,
      [title, description, categoryId, location, priority, incidentId]
    );
    await client.query(
      `INSERT INTO incident_vector_sync (incident_id, indexed_at)
       VALUES ($1, NULL)
       ON CONFLICT (incident_id)
       DO UPDATE SET indexed_at = NULL,
                     last_error = NULL,
                     updated_at = CURRENT_TIMESTAMP`,
      [incidentId]
    );
    await client.query(
      `INSERT INTO status_history
         (incident_id, old_status, new_status, changed_by, remarks)
       VALUES ($1, $2, 'pending', $3, $4)`,
      [
        incidentId,
        previousStatus,
        ownership.rows[0].reported_by,
        "Reporter updated the incident; returned to admin for review and reassignment",
      ]
    );
    await client.query("COMMIT");

    let vectorIndexed = true;
    try {
      await syncIncidentVector(result.rows[0]);
    } catch (error) {
      vectorIndexed = false;
      console.error("Incident updated; vector indexing is pending:", error);
    }

    return NextResponse.json({
      success: true,
      message: vectorIndexed
        ? "Incident updated and returned to admin for review and reassignment."
        : "Incident updated and returned to admin. Similarity indexing will retry when Qdrant is available.",
      vector_indexed: vectorIndexed,
      incident: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to update incident:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update incident." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request, ["resident"]);
  if (auth instanceof NextResponse) return auth;

  const incidentId = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(incidentId) || incidentId < 1) {
    return NextResponse.json(
      { success: false, message: "A valid incident ID is required." },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const incident = await client.query(
      `SELECT i.status
       FROM incidents i
       JOIN users u ON u.user_id = i.reported_by
       WHERE i.incident_id = $1
         AND u.auth_account_id = $2
       FOR UPDATE OF i`,
      [incidentId, auth.userId]
    );
    if (incident.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Incident not found." },
        { status: 404 }
      );
    }
    if (!["pending", "assigned"].includes(incident.rows[0].status)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          message: "Reports can only be deleted before work has started.",
        },
        { status: 409 }
      );
    }

    await client.query("DELETE FROM incidents WHERE incident_id = $1", [incidentId]);
    await client.query("COMMIT");

    let vectorDeleted = true;
    try {
      await deleteIncidentVector(incidentId);
    } catch (error) {
      vectorDeleted = false;
      console.error("Incident deleted; stale Qdrant point could not be removed:", error);
    }
    return NextResponse.json({
      success: true,
      message: vectorDeleted
        ? "Incident deleted successfully."
        : "Incident deleted. Its stale search point will not be returned because the incident is gone.",
      vector_deleted: vectorDeleted,
      incident_id: incidentId,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to delete incident:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete incident." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
