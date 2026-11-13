import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  ...(connectionString ? { connectionString } : {}),
  max: 10,
});

export async function ensureFeedbackTable() {
  if (!connectionString) {
    return;
  }

  try {
    const result = await pool.query(
      `SELECT to_regclass('public.feedback') AS feedback_exists`
    );

    if (result.rows[0]?.feedback_exists) {
      return;
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        feedback_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        incident_id   BIGINT NOT NULL
                      REFERENCES incidents(incident_id) ON DELETE CASCADE,
        submitted_by  BIGINT NOT NULL
                      REFERENCES users(user_id) ON DELETE RESTRICT,
        rating        SMALLINT NOT NULL
                      CHECK (rating BETWEEN 1 AND 5),
        comment       TEXT,
        submitted_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT feedback_once_per_incident_user
          UNIQUE (incident_id, submitted_by)
      );

      CREATE INDEX IF NOT EXISTS feedback_incident_id_idx
        ON feedback (incident_id);

      CREATE INDEX IF NOT EXISTS feedback_submitted_by_idx
        ON feedback (submitted_by);
    `);
  } catch (error) {
    console.warn("Failed to ensure feedback table exists:", error);
  }
}

export async function ensureComplaintsTable() {
  if (!connectionString) {
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        complaint_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        incident_id   BIGINT NOT NULL
                        REFERENCES incidents(incident_id) ON DELETE CASCADE,
        submitted_by  BIGINT NOT NULL
                        REFERENCES users(user_id) ON DELETE RESTRICT,
        reason        TEXT NOT NULL,
        category      VARCHAR(50) DEFAULT 'general',
        status        VARCHAR(30) NOT NULL DEFAULT 'open',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS complaints_incident_id_idx
        ON complaints (incident_id);

      CREATE INDEX IF NOT EXISTS complaints_submitted_by_idx
        ON complaints (submitted_by);
    `);
  } catch (error) {
    console.warn("Failed to ensure complaints table exists:", error);
  }
}

export async function ensureNotificationsTable() {
  if (!connectionString) {
    return;
  }

  try {
    // 1. Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        notification_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        recipient_id    BIGINT NOT NULL
                          REFERENCES users(user_id) ON DELETE CASCADE,
        feedback_id     BIGINT
                          REFERENCES feedback(feedback_id) ON DELETE CASCADE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        read_at         TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS notifications_recipient_created_at_idx
        ON notifications (recipient_id, created_at DESC);
    `);

    // 2. Allow feedback_id to be nullable if complaint notification, add complaint_id & type
    await pool.query(`
      ALTER TABLE notifications ALTER COLUMN feedback_id DROP NOT NULL;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS complaint_id BIGINT REFERENCES complaints(complaint_id) ON DELETE CASCADE;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(30) NOT NULL DEFAULT 'feedback';
    `);

    // 3. Backfill notifications for any existing feedback that was not yet notified
    await pool.query(`
      INSERT INTO notifications (recipient_id, feedback_id, type)
      SELECT recipients.recipient_id, recipients.feedback_id, 'feedback'
      FROM (
        SELECT admin.user_id AS recipient_id, feedback.feedback_id
        FROM feedback
        CROSS JOIN users admin
        WHERE admin.role = 'admin'
          AND admin.is_active = true

        UNION

        SELECT assignment.officer_id AS recipient_id, feedback.feedback_id
        FROM feedback
        JOIN assignments assignment
          ON assignment.incident_id = feedback.incident_id
      ) recipients
      WHERE NOT EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.recipient_id = recipients.recipient_id
          AND n.feedback_id = recipients.feedback_id
      )
    `);
  } catch (error) {
    console.warn("Failed to ensure notifications table exists:", error);
  }
}

void (async () => {
  await ensureFeedbackTable();
  await ensureComplaintsTable();
  await ensureNotificationsTable();
})();

export default pool;
