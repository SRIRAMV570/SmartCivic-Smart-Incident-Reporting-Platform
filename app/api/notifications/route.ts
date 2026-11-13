import { NextResponse } from "next/server";
import pool, { ensureNotificationsTable } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth/authenticate";

const allowedRoles = ["admin", "officer"] as const;

export async function GET(request: Request) {
  await ensureNotificationsTable();

  const auth = await authenticateRequest(request, [...allowedRoles]);
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await pool.query(
      `SELECT
         notification.notification_id,
         notification.feedback_id,
         notification.complaint_id,
         COALESCE(notification.type, 'feedback') AS type,
         notification.created_at,
         notification.read_at,
         incident.incident_id,
         incident.title AS incident_title,
         feedback.rating,
         feedback.comment,
         complaint.reason AS complaint_reason,
         complaint.category AS complaint_category,
         COALESCE(feedback_submitter.full_name, complaint_submitter.full_name, 'Citizen') AS submitted_by_name,
         (
           SELECT COUNT(*)::int
           FROM notifications unread
           WHERE unread.recipient_id = recipient.user_id
             AND unread.read_at IS NULL
         ) AS unread_count
       FROM users recipient
       JOIN notifications notification
         ON notification.recipient_id = recipient.user_id
       LEFT JOIN feedback ON feedback.feedback_id = notification.feedback_id
       LEFT JOIN users feedback_submitter ON feedback_submitter.user_id = feedback.submitted_by
       LEFT JOIN complaints complaint ON complaint.complaint_id = notification.complaint_id
       LEFT JOIN users complaint_submitter ON complaint_submitter.user_id = complaint.submitted_by
       LEFT JOIN incidents incident ON incident.incident_id = COALESCE(feedback.incident_id, complaint.incident_id)
       WHERE recipient.auth_account_id = $1
         AND notification.read_at IS NULL
       ORDER BY notification.created_at DESC
       LIMIT 50`,
      [auth.userId]
    );

    return NextResponse.json({
      success: true,
      notifications: result.rows,
      unread_count: result.rows[0]?.unread_count ?? 0,
    });
  } catch (error) {
    console.error("Failed to fetch notifications:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch notifications." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  await ensureNotificationsTable();

  const auth = await authenticateRequest(request, [...allowedRoles]);
  if (auth instanceof NextResponse) return auth;

  const body: unknown = await request.json().catch(() => null);
  const values =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const notificationId = Number(values.notification_id);

  if (!Number.isInteger(notificationId) || notificationId < 1) {
    return NextResponse.json(
      { success: false, message: "A valid notification_id is required." },
      { status: 400 }
    );
  }

  try {
    const result = await pool.query(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
       WHERE notification_id = $1
         AND recipient_id = (
           SELECT user_id FROM users WHERE auth_account_id = $2
         )
       RETURNING notification_id, read_at`,
      [notificationId, auth.userId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, message: "Notification not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      notification: result.rows[0],
    });
  } catch (error) {
    console.error("Failed to mark notification as read:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update notification." },
      { status: 500 }
    );
  }
}
