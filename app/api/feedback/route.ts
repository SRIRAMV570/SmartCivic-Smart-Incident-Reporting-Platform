
import { NextResponse } from "next/server";
import pool, { ensureFeedbackTable } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth/authenticate";

// GET /api/feedback?incident_id=<id>
// Returns feedback for a specific incident.
// Residents see only their own feedback; admins see all feedback for that incident.
export async function GET(request: Request) {
  await ensureFeedbackTable();

  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const incidentId = Number(url.searchParams.get("incident_id"));

  if (!Number.isInteger(incidentId) || incidentId < 1) {
    return NextResponse.json(
      { success: false, message: "A valid incident_id query parameter is required." },
      { status: 400 }
    );
  }

  try {
    if (auth.role === "admin") {
      // Admins see all feedback for this incident
      const result = await pool.query(
        `SELECT
           f.feedback_id,
           f.incident_id,
           f.submitted_by,
           u.full_name AS submitted_by_name,
           f.rating,
           f.comment,
           f.submitted_at
         FROM feedback f
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

    // Residents see only their own feedback for this incident
    const result = await pool.query(
      `SELECT
         f.feedback_id,
         f.incident_id,
         f.submitted_by,
         f.rating,
         f.comment,
         f.submitted_at
       FROM feedback f
       JOIN users u ON f.submitted_by = u.user_id
       WHERE f.incident_id = $1
         AND u.auth_account_id = $2`,
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
