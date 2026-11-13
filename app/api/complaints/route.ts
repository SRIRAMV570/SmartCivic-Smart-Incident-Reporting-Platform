import { NextResponse } from "next/server";
import pool, { ensureComplaintsTable, ensureNotificationsTable } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth/authenticate";

export async function GET(request: Request) {
  await ensureComplaintsTable();
  await ensureNotificationsTable();

  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    if (auth.role === "admin") {
      const result = await pool.query(
        `SELECT
           c.complaint_id,
           c.incident_id,
           i.title AS incident_title,
           i.status AS incident_status,
           i.priority AS incident_priority,
           cat.category_name,
           d.department_name,
           c.submitted_by,
           u.full_name AS submitted_by_name,
           COALESCE(
             (
               SELECT string_agg(assigned_officer.full_name, ', ' ORDER BY assigned_officer.full_name)
               FROM assignments assignment
               JOIN users assigned_officer
                 ON assigned_officer.user_id = assignment.officer_id
               WHERE assignment.incident_id = i.incident_id
             ),
             ''
           ) AS assigned_officer_name,
           c.category AS complaint_category,
           c.reason,
           c.status AS complaint_status,
           c.created_at
         FROM complaints c
         JOIN incidents i ON c.incident_id = i.incident_id
         JOIN categories cat ON i.category_id = cat.category_id
         JOIN departments d ON cat.department_id = d.department_id
         JOIN users u ON c.submitted_by = u.user_id
         ORDER BY c.created_at DESC`
      );

      return NextResponse.json({
        success: true,
        count: result.rows.length,
        complaints: result.rows,
      });
    }

    if (auth.role === "officer") {
      const result = await pool.query(
        `SELECT
           c.complaint_id,
           c.incident_id,
           i.title AS incident_title,
           i.status AS incident_status,
           i.priority AS incident_priority,
           cat.category_name,
           d.department_name,
           u.full_name AS submitted_by_name,
           c.category AS complaint_category,
           c.reason,
           c.status AS complaint_status,
           c.created_at
         FROM complaints c
         JOIN incidents i ON c.incident_id = i.incident_id
         JOIN categories cat ON i.category_id = cat.category_id
         JOIN departments d ON cat.department_id = d.department_id
         JOIN users u ON c.submitted_by = u.user_id
         JOIN users officer
           ON officer.auth_account_id = $1
          AND officer.is_active = true
         WHERE EXISTS (
           SELECT 1
           FROM assignments assignment
           WHERE assignment.incident_id = i.incident_id
             AND assignment.officer_id = officer.user_id
         )
         ORDER BY c.created_at DESC`,
        [auth.userId]
      );

      return NextResponse.json({
        success: true,
        count: result.rows.length,
        complaints: result.rows,
      });
    }

    // Residents see complaints they submitted
    const result = await pool.query(
      `SELECT
         c.complaint_id,
         c.incident_id,
         i.title AS incident_title,
         i.status AS incident_status,
         c.category AS complaint_category,
         c.reason,
         c.status AS complaint_status,
         c.created_at,
         NOT EXISTS (
           SELECT 1
           FROM complaints newer
           WHERE newer.incident_id = c.incident_id
             AND newer.submitted_by = c.submitted_by
             AND (newer.created_at, newer.complaint_id) >
                 (c.created_at, c.complaint_id)
         ) AS is_latest,
         cooldown.next_complaint_at,
         (
           i.status NOT IN ('resolved', 'rejected')
           AND (
             CURRENT_TIMESTAMP >= cooldown.next_complaint_at
             OR COALESCE(
               last_change.is_degraded AND last_change.new_status = i.status,
               false
             )
           )
         ) AS can_complain_again
       FROM complaints c
       JOIN incidents i ON c.incident_id = i.incident_id
       JOIN users u ON c.submitted_by = u.user_id
       LEFT JOIN LATERAL (
         SELECT
           history.changed_at,
           history.new_status,
           CASE history.old_status
             WHEN 'pending' THEN 0
             WHEN 'assigned' THEN 1
             WHEN 'in_progress' THEN 2
             WHEN 'resolved' THEN 3
             WHEN 'rejected' THEN 3
             ELSE -1
           END > CASE history.new_status
             WHEN 'pending' THEN 0
             WHEN 'assigned' THEN 1
             WHEN 'in_progress' THEN 2
             WHEN 'resolved' THEN 3
             WHEN 'rejected' THEN 3
             ELSE -1
           END AS is_degraded
         FROM status_history history
         WHERE history.incident_id = c.incident_id
           AND history.changed_at > c.created_at
           AND history.old_status IS DISTINCT FROM history.new_status
         ORDER BY history.changed_at DESC, history.history_id DESC
         LIMIT 1
       ) last_change ON TRUE
       CROSS JOIN LATERAL (
         SELECT GREATEST(
           c.created_at,
           COALESCE(last_change.changed_at, c.created_at)
         ) + INTERVAL '1 day' AS next_complaint_at
       ) cooldown
       WHERE u.auth_account_id = $1
       ORDER BY c.created_at DESC, c.complaint_id DESC`,
      [auth.userId]
    );

    return NextResponse.json({
      success: true,
      count: result.rows.length,
      complaints: result.rows,
    });
  } catch (error) {
    console.error("Failed to fetch complaints:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch complaints." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  await ensureComplaintsTable();
  await ensureNotificationsTable();

  const auth = await authenticateRequest(request, ["resident"]);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const values =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const incidentId = Number(values.incident_id);
  const reason = typeof values.reason === "string" ? values.reason.trim() : "";
  const category =
    typeof values.category === "string" ? values.category.trim() : "Work not progressing";

  if (!Number.isInteger(incidentId) || incidentId < 1) {
    return NextResponse.json(
      { success: false, message: "A valid incident_id is required." },
      { status: 400 }
    );
  }

  if (!reason || reason.length < 5) {
    return NextResponse.json(
      { success: false, message: "Please provide a detailed reason (at least 5 characters)." },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Look up the resident's user_id
    const userResult = await client.query(
      "SELECT user_id, full_name FROM users WHERE auth_account_id = $1",
      [auth.userId]
    );
    if (userResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Your account profile was not found." },
        { status: 403 }
      );
    }
    const user = userResult.rows[0];
    const userId = user.user_id as number;

    // Verify the incident exists, belongs to this resident, and is NOT resolved
    const incidentResult = await client.query(
      `SELECT i.incident_id, i.status, i.title
       FROM incidents i
       JOIN users u ON u.user_id = i.reported_by
       WHERE i.incident_id = $1
         AND u.auth_account_id = $2
       FOR UPDATE OF i`,
      [incidentId, auth.userId]
    );

    if (incidentResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Incident not found or does not belong to you." },
        { status: 404 }
      );
    }

    const currentIncident = incidentResult.rows[0];
    if (["resolved", "rejected"].includes(currentIncident.status)) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          message: "This incident is closed and can no longer receive complaints.",
        },
        { status: 409 }
      );
    }

    const cooldown = await client.query(
      `SELECT
         GREATEST(
           latest.created_at,
           COALESCE(last_change.changed_at, latest.created_at)
         ) + INTERVAL '1 day' AS next_complaint_at,
         CURRENT_TIMESTAMP <
           GREATEST(
             latest.created_at,
             COALESCE(last_change.changed_at, latest.created_at)
           ) + INTERVAL '1 day'
           AND NOT COALESCE(
             last_change.is_degraded
               AND last_change.new_status = $3,
             false
           ) AS cooling_down
       FROM complaints latest
       LEFT JOIN LATERAL (
         SELECT
           history.changed_at,
           history.new_status,
           CASE history.old_status
             WHEN 'pending' THEN 0
             WHEN 'assigned' THEN 1
             WHEN 'in_progress' THEN 2
             WHEN 'resolved' THEN 3
             WHEN 'rejected' THEN 3
             ELSE -1
           END > CASE history.new_status
             WHEN 'pending' THEN 0
             WHEN 'assigned' THEN 1
             WHEN 'in_progress' THEN 2
             WHEN 'resolved' THEN 3
             WHEN 'rejected' THEN 3
             ELSE -1
           END AS is_degraded
         FROM status_history history
         WHERE history.incident_id = latest.incident_id
           AND history.changed_at > latest.created_at
           AND history.old_status IS DISTINCT FROM history.new_status
         ORDER BY history.changed_at DESC, history.history_id DESC
         LIMIT 1
       ) last_change ON TRUE
       WHERE latest.incident_id = $1
         AND latest.submitted_by = $2
       ORDER BY latest.created_at DESC, latest.complaint_id DESC
       LIMIT 1`,
      [incidentId, userId, currentIncident.status]
    );
    if (cooldown.rows[0]?.cooling_down) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          message: "You can submit another complaint after the 24-hour waiting period.",
          next_complaint_at: cooldown.rows[0].next_complaint_at,
        },
        { status: 429 }
      );
    }

    // Insert complaint
    const complaintResult = await client.query(
      `INSERT INTO complaints (incident_id, submitted_by, category, reason, status)
       VALUES ($1, $2, $3, $4, 'open')
       RETURNING *`,
      [incidentId, userId, category, reason]
    );
    const complaint = complaintResult.rows[0];

    // Log in status history for transparency and audit trail
    await client.query(
      `INSERT INTO status_history
         (incident_id, old_status, new_status, changed_by, remarks)
       VALUES ($1, $2, $2, $3, $4)`,
      [
        incidentId,
        currentIncident.status,
        userId,
        `Citizen complaint submitted: [${category}] ${reason}`,
      ]
    );

    // Notify all active admins and the assigned officer
    await client.query(
      `INSERT INTO notifications (recipient_id, complaint_id, type)
       SELECT recipient.user_id, $1, 'complaint'
       FROM (
         SELECT user_id
         FROM users
         WHERE role = 'admin'
           AND is_active = true
         UNION
         SELECT officer_id AS user_id
         FROM assignments
         WHERE incident_id = $2
       ) recipient
       WHERE NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.recipient_id = recipient.user_id
           AND n.complaint_id = $1
       )`,
      [complaint.complaint_id, incidentId]
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        success: true,
        message: "Your complaint has been submitted. Admins and officers have been alerted.",
        complaint,
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Failed to submit complaint:", error);
    return NextResponse.json(
      { success: false, message: "Failed to submit complaint." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
