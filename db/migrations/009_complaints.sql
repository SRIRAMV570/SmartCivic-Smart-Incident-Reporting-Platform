BEGIN;

CREATE TABLE IF NOT EXISTS complaints (
  complaint_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incident_id   BIGINT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  submitted_by  BIGINT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
  reason        TEXT NOT NULL,
  category      VARCHAR(50) DEFAULT 'general',
  status        VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS complaints_incident_id_idx ON complaints (incident_id);
CREATE INDEX IF NOT EXISTS complaints_submitted_by_idx ON complaints (submitted_by);

ALTER TABLE notifications ALTER COLUMN feedback_id DROP NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS complaint_id BIGINT REFERENCES complaints(complaint_id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(30) NOT NULL DEFAULT 'feedback';

COMMIT;
