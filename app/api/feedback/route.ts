import { NextResponse } from "next/server";
import pool, { ensureFeedbackTable, ensureNotificationsTable } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth/authenticate";

// GET /api/feedback?incident_id=<optional_id>
// Returns feedback for a specific incident or all feedback for admin.
export async function GET(request: Request) {
  await ensureFeedbackTable();
  await ensureNotificationsTable();

  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const incidentIdParam = url.searchParams.get("incident_id");
  const incidentId = incidentIdParam ? Number(incidentIdParam) : null;

  try {
    if (auth.role === "admin") {
      if (incidentId && Number.isInteger(incidentId) && incidentId > 0) {
        // Admins see all feedback for this specific incident
        const result = await pool.query(
          `SELECT
             f.feedback_id,
             f.incident_id,
             i.title AS incident_title,
             c.category_name,
             d.department_name,
             f.submitted_by,
             u.full_name AS submitted_by_name,
             COALESCE(
               (
                 SELECT string_agg(officer.full_name, ', ' ORDER BY officer.full_name)
                 FROM assignments assignment
                 JOIN users officer ON officer.user_id = assignment.officer_id
                 WHERE assignment.incident_id = i.incident_id
               ),
               ''
             ) AS assigned_officer_name,
             f.rating,
             f.comment,
             f.submitted_at
           FROM feedback f
           JOIN incidents i ON f.incident_id = i.incident_id
           JOIN categories c ON i.category_id = c.category_id
           JOIN departments d ON c.department_id = d.department_id
           JOIN users u ON f.submitted_by = u.user_id
           WHERE f.incident_id = $1
           ORDER BY f.submitted_at DESC`,
          [incidentId]
        );
        return NextResponse.json({
          success: true,
          count: result.rows.length,
          feedback: result.rows,
        });
      }

      // Admins see ALL feedback across all incidents for the civic feedback page
      const result = await pool.query(
        `SELECT
           f.feedback_id,
           f.incident_id,
           i.title AS incident_title,
           c.category_name,
           d.department_name,
           f.submitted_by,
           u.full_name AS submitted_by_name,
           COALESCE(
             (
               SELECT string_agg(officer.full_name, ', ' ORDER BY officer.full_name)
               FROM assignments assignment
               JOIN users officer ON officer.user_id = assignment.officer_id
               WHERE assignment.incident_id = i.incident_id
             ),
             ''
           ) AS assigned_officer_name,
           f.rating,
           f.comment,
           f.submitted_at
         FROM feedback f
         JOIN incidents i ON f.incident_id = i.incident_id
         JOIN categories c ON i.category_id = c.category_id
         JOIN departments d ON c.department_id = d.department_id
         JOIN users u ON f.submitted_by = u.user_id
         ORDER BY f.submitted_at DESC`
      );
      return NextResponse.json({
        success: true,
        count: result.rows.length,
        feedback: result.rows,
      });
    }

    if (
      incidentId !== null &&
      (!Number.isInteger(incidentId) || incidentId < 1)
    ) {
      return NextResponse.json(
        { success: false, message: "A valid incident_id query parameter is required." },
        { status: 400 }
      );
    }

    if (auth.role === "officer") {
      const result = await pool.query(
        `SELECT
           f.feedback_id,
           f.incident_id,
           i.title AS incident_title,
           i.status AS incident_status,
           c.category_name,
           d.department_name,
           reporter.full_name AS submitted_by_name,
           f.rating,
           f.comment,
           f.submitted_at
         FROM feedback f
         JOIN incidents i ON i.incident_id = f.incident_id
         JOIN categories c ON c.category_id = i.category_id
         JOIN departments d ON d.department_id = c.department_id
         JOIN users reporter ON reporter.user_id = f.submitted_by
         JOIN users officer ON officer.auth_account_id = $1 AND officer.is_active = true
         WHERE ($2::bigint IS NULL OR f.incident_id = $2)
           AND EXISTS (
             SELECT 1
             FROM assignments assignment
             WHERE assignment.incident_id = i.incident_id
               AND assignment.officer_id = officer.user_id
           )
         ORDER BY f.submitted_at DESC`,
        [auth.userId, incidentId]
      );
      return NextResponse.json({
        success: true,
        count: result.rows.length,
        feedback: result.rows,
      });
    }

    // Residents see their own feedback, optionally filtered to one incident.
    const result = await pool.query(
      `SELECT
         f.feedback_id,
         f.incident_id,
         i.title AS incident_title,
         i.status AS incident_status,
         c.category_name,
         d.department_name,
         u.full_name AS submitted_by_name,
         f.rating,
         f.comment,
         f.submitted_at
       FROM feedback f
       JOIN incidents i ON i.incident_id = f.incident_id
       JOIN categories c ON c.category_id = i.category_id
       JOIN departments d ON d.department_id = c.department_id
       JOIN users u ON f.submitted_by = u.user_id
       WHERE ($1::bigint IS NULL OR f.incident_id = $1)
         AND u.auth_account_id = $2
       ORDER BY f.submitted_at DESC`,
      [incidentId, auth.userId]
    );
    return NextResponse.json({
      success: true,
      count: result.rows.length,
      feedback: result.rows,
    });
  } catch (error) {
    console.error("Failed to fetch feedback:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch feedback." },
      { status: 500 }
    );
  }
}

// POST /api/feedback
// Body: { incident_id, rating (1-5), comment? }
// Only residents can submit feedback, only on their own resolved incidents.
// One submission per (incident, user) pair — enforced by DB UNIQUE constraint.
export async function POST(request: Request) {
  await ensureFeedbackTable();
  await ensureNotificationsTable();

  const auth = await authenticateRequest(request, ["resident"]);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const values =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  const incidentId = Number(values.incident_id);
  const rating = Number(values.rating);
  const comment =
    typeof values.comment === "string" ? values.comment.trim() : null;

  if (!Number.isInteger(incidentId) || incidentId < 1) {
    return NextResponse.json(
      { success: false, message: "A valid incident_id is required." },
      { status: 400 }
    );
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json(
      { success: false, message: "Rating must be a whole number between 1 and 5." },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Look up the resident's user_id
    const userResult = await client.query(
      "SELECT user_id FROM users WHERE auth_account_id = $1",
      [auth.userId]
    );
    if (userResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Your account profile was not found." },
        { status: 403 }
      );
    }
    const userId = userResult.rows[0].user_id as number;

    // Verify the incident exists, belongs to this resident, and is resolved
    const incidentResult = await client.query(
      `SELECT i.incident_id, i.status
       FROM incidents i
       JOIN users u ON u.user_id = i.reported_by
       WHERE i.incident_id = $1
         AND u.auth_account_id = $2`,
      [incidentId, auth.userId]
    );

    if (incidentResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { success: false, message: "Incident not found." },
        { status: 404 }
      );
    }

    if (incidentResult.rows[0].status !== "resolved") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          success: false,
          message: "Feedback can only be submitted for resolved incidents.",
        },
        { status: 409 }
      );
    }

    // Insert feedback — DB UNIQUE constraint prevents duplicates
    const result = await client.query(
      `INSERT INTO feedback (incident_id, submitted_by, rating, comment)
       VALUES ($1, $2, $3, $4)
       RETURNING feedback_id, incident_id, submitted_by, rating, comment, submitted_at`,
      [incidentId, userId, rating, comment || null]
    );

    // Notify all active admins and the assigned officer
    await client.query(
      `INSERT INTO notifications (recipient_id, feedback_id, type)
       SELECT recipient.user_id, $1, 'feedback'
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
       ON CONFLICT (recipient_id, feedback_id) DO NOTHING`,
      [result.rows[0].feedback_id, incidentId]
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        success: true,
        message: "Thank you for your feedback!",
        feedback: result.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK");

    // Handle the UNIQUE constraint violation gracefully
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "You have already submitted feedback for this incident.",
        },
        { status: 409 }
      );
    }

    console.error("Failed to submit feedback:", error);
    return NextResponse.json(
      { success: false, message: "Failed to submit feedback." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
