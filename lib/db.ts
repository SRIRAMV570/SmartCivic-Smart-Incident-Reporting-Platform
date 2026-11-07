
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

void ensureFeedbackTable();

export default pool;
