BEGIN;

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

COMMIT;
