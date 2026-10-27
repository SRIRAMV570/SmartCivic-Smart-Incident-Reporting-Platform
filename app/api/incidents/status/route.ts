
import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { authenticateRequest } from "@/lib/auth/authenticate";

const allowedStatuses = [
  "pending",
  "assigned",
  "in_progress",
  "resolved",
  "rejected",
];

export async function PATCH(
  request: Request
) {
  const auth = await authenticateRequest(request, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const client = await pool.connect();

  try {
    // The incident ID is supplied as a query parameter: ?id=1
    const url = new URL(request.url);
    const incidentId = Number(url.searchParams.get("id"));

    if (!Number.isInteger(incidentId) || incidentId < 1) {
      return NextResponse.json(
        { success: false, message: "A valid incident ID is required." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const newStatus =
      typeof body.status === "string" ? body.status : "";

    if (!allowedStatuses.includes(newStatus)) {
      return NextResponse.json(
        { success: false, message: "Invalid incident status." },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    const currentResult = await client.query(
      `SELECT status
       FROM incidents
       WHERE incident_id = $1
       FOR UPDATE`,
      [incidentId]
    );

    if (currentResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Incident not found." },
        { status: 404 }
      );
    }

    const oldStatus = currentResult.rows[0].status;

    if (oldStatus === newStatus) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        success: true,
        message: "The incident already has this status.",
        status: oldStatus,
      });
    }

    const actor = await client.query(
      "SELECT user_id FROM users WHERE auth_account_id = $1",
      [auth.userId]
    );

    if (actor.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Your account profile was not found." },
        { status: 403 }
      );
    }

    await client.query(
      `UPDATE incidents
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE incident_id = $2`,
      [newStatus, incidentId]
    );

    await client.query(
      `INSERT INTO status_history
         (incident_id, old_status, new_status, changed_by, remarks)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        incidentId,
        oldStatus,
        newStatus,
        actor.rows[0].user_id,
        `Status changed from ${oldStatus} to ${newStatus}`,
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Incident status updated successfully.",
      incident_id: incidentId,
      old_status: oldStatus,
      new_status: newStatus,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to update incident status:", error);

    return NextResponse.json(
      { success: false, message: "Failed to update incident status." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
