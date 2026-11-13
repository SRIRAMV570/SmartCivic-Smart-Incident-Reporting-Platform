
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authenticateRequest } from "@/lib/auth/authenticate";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const client = await pool.connect();

  try {
    const body: unknown = await request.json();
    const values =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)
        : {};

    const incidentId = Number(values.incident_id);
    const officerIds = Array.isArray(values.officer_ids)
      ? values.officer_ids.map(Number)
      : values.officer_id === undefined
        ? []
        : [Number(values.officer_id)];
    const assigner = await client.query(
      "SELECT user_id FROM users WHERE auth_account_id = $1",
      [auth.userId]
    );

    if (
      !Number.isInteger(incidentId) ||
      incidentId <= 0 ||
      officerIds.length === 0 ||
      officerIds.some((officerId) => !Number.isInteger(officerId) || officerId <= 0) ||
      new Set(officerIds).size !== officerIds.length
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "A valid incident and one or more unique officer IDs are required.",
        },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    if (assigner.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Your account profile was not found." },
        { status: 403 }
      );
    }

    const assignedBy = assigner.rows[0].user_id as number;
    const incident = await client.query(
      "SELECT incident_id, category_id, status FROM incidents WHERE incident_id = $1 FOR UPDATE",
      [incidentId]
    );

    if (incident.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Incident not found." },
        { status: 404 }
      );
    }
    const oldStatus = incident.rows[0].status as string;
    if (oldStatus !== "pending") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          message: "Only pending incidents can be assigned.",
        },
        { status: 409 }
      );
    }

    const existingAssignment = await client.query(
      "SELECT 1 FROM assignments WHERE incident_id = $1",
      [incidentId]
    );
    if (existingAssignment.rowCount !== 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          message: "This incident already has an assigned officer.",
        },
        { status: 409 }
      );
    }

    const officers = await client.query(
      `SELECT user_id, full_name, department_id
       FROM users
       WHERE user_id = ANY($1::bigint[])
         AND role = 'officer'
         AND is_active = true
         AND department_id = (
           SELECT category.department_id
           FROM categories category
           JOIN departments department
             ON department.department_id = category.department_id
           WHERE category.category_id = $2
             AND department.is_active = true
         )`,
      [officerIds, incident.rows[0].category_id]
    );

    if (officers.rowCount !== officerIds.length) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          message: "Choose active officers from the incident's department.",
        },
        { status: 400 }
      );
    }

    const assignment = await client.query(
      `INSERT INTO assignments (incident_id, officer_id, assigned_by)
       SELECT $1, selected.officer_id, $3
       FROM unnest($2::bigint[]) AS selected(officer_id)
       RETURNING *`,
      [incidentId, officerIds, assignedBy]
    );

    await client.query(
      `UPDATE incidents
       SET status = 'assigned', updated_at = CURRENT_TIMESTAMP
       WHERE incident_id = $1`,
      [incidentId]
    );
    await client.query(
      `INSERT INTO status_history
        (incident_id, old_status, new_status, changed_by, remarks)
       VALUES ($1, $2, 'assigned', $3, $4)`,
      [
        incidentId,
        oldStatus,
        assignedBy,
        `Assigned to ${officers.rows
          .map((officer: { full_name: string }) => officer.full_name)
          .join(", ")}`.slice(0, 1000),
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Incident assigned successfully.",
      assignments: assignment.rows,
      officers: officers.rows,
      officer: officers.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Assignment API error:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to assign incident.",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
